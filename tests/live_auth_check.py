"""Isolated real Auth/API/Storage checks. No family data is fetched.

Creates unique synthetic test users with admin SQL, never changes existing users.
No emails, no migrations. All committed fixtures are removed in finally.
Passwords/tokens exist only in process memory. Requires MATTIA_DB_PASSWORD_FILE.
"""
import base64
import json
from pathlib import Path
import re
import secrets
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import uuid
from live_rls_check import connect

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
URL=re.search(r"var SUPABASE_URL = '([^']+)'",html)[1]
KEY=re.search(r"var SUPABASE_KEY = '([^']+)'",html)[1]
IMAGE=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=')

def api(method,path,token=None,data=None,binary=False):
    headers={'apikey':KEY,'Authorization':'Bearer '+(token or KEY)}
    if binary:headers['Content-Type']='image/png';body=data
    elif data is not None:headers['Content-Type']='application/json';body=json.dumps(data).encode()
    else:body=None
    if method in ('POST','PATCH') and path.startswith('/rest/'):headers['Prefer']='return=representation'
    try:
        with urlopen(Request(URL+path,data=body,headers=headers,method=method),timeout=25) as response:
            content=response.read()
            return response.status,json.loads(content) if 'json' in response.headers.get('Content-Type','') else content
    except HTTPError as error:
        return error.code,None

def run():
    conn=connect();c=conn.cursor();committed=False
    users={r:{'id':str(uuid.uuid4()),'password':secrets.token_urlsafe(32)} for r in ['owner','viewer','contributor','outsider']}
    for account in users.values():account['email']='auth-check-'+account['id']+'@example.invalid'
    mids=[str(uuid.uuid4()) for _ in range(3)];pids=[str(uuid.uuid4()) for _ in range(2)]
    paths=[f"{users['owner']['id']}/{mids[0]}/test.png",f"{users['contributor']['id']}/{mids[2]}/test.png"]
    tokens={};uploaded=[];chapters=[]
    try:
        # Standard isolated Auth fixtures with confirmed invalid-domain emails.
        # Each predicate during cleanup uses generated UUIDs, never existing users.
        for role,a in users.items():
            c.execute("""insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
                confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
                values('00000000-0000-0000-0000-000000000000',%s,'authenticated','authenticated',%s,
                extensions.crypt(%s,extensions.gen_salt('bf')),now(),'','','','',%s::jsonb,'{}',now(),now())""",
                (a['id'],a['email'],a['password'],json.dumps({'provider':'email','providers':['email']})))
            c.execute("insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values(%s,%s,%s::jsonb,'email',now(),now())",
                (a['id'],a['id'],json.dumps({'sub':a['id'],'email':a['email'],'email_verified':True})))
            if role!='outsider':c.execute('insert into public.album_access(email,role) values(%s,%s)',(a['email'],role))
        c.execute('select value from generate_series(-30000,-29000) value where not exists(select 1 from public.album_chapters where id=value) limit 2')
        chapters=[row[0] for row in c.fetchall()]
        for cid,visible in zip(chapters,[True,False]):
            c.execute('insert into public.album_chapters(id,slug,title,visible) values(%s,%s,%s,%s)',(cid,'auth-check-'+str(uuid.uuid4()),'COLLAUDO TEMPORANEO — eliminato al termine',visible))
        for mid,cid,role in [(mids[0],chapters[0],'owner'),(mids[1],chapters[1],'owner'),(mids[2],chapters[0],'contributor')]:
            c.execute('insert into public.album_memories(id,chapter_id,title,created_by) values(%s,%s,%s,%s)',(mid,cid,'COLLAUDO ISOLATO',users[role]['id']))
        conn.commit();committed=True
        for role,a in users.items():
            status,result=api('POST','/auth/v1/token?grant_type=password',data={'email':a['email'],'password':a['password']})
            assert status==200,(role,'isolated password login',status)
            tokens[role]=result['access_token']
            status,value=api('POST','/rest/v1/rpc/album_role',tokens[role],{})
            assert status==200 and value==(None if role=='outsider' else role),(role,'role RPC',status)
            status,refresh=api('POST','/auth/v1/token?grant_type=refresh_token',data={'refresh_token':result['refresh_token']})
            assert status==200,(role,'token refresh',status)
            tokens[role]=refresh['access_token']
        print('PASS real Auth: password login, role verification and token refresh for four isolated accounts.')
        for index,role in [(0,'owner'),(1,'contributor')]:
            status,_=api('POST','/storage/v1/object/mattia-album/'+paths[index],tokens[role],IMAGE,True)
            assert status==200,(role,'synthetic upload',status);uploaded.append(paths[index])
            status,_=api('POST','/rest/v1/album_media',tokens[role],{'id':pids[index],'memory_id':mids[0 if index==0 else 2],
                'storage_path':paths[index],'created_by':users[role]['id'],'media_kind':'image','mime_type':'image/png'})
            assert status==201,(role,'synthetic metadata insert',status)
        for role in ['owner','viewer','contributor','outsider',None]:
            token=tokens.get(role)
            status,value=api('GET','/rest/v1/album_memories?select=id&id=eq.'+mids[1],token)
            assert (status==200 and value==[{'id':mids[1]}]) if role=='owner' else (status in (401,403) or value==[]),(role,'hidden chapter')
            status,_=api('GET','/storage/v1/object/authenticated/mattia-album/'+paths[0],token)
            assert (status==200) if role in ('owner','viewer','contributor') else (status in (400,401,403,404)),(role,'private download',status)
        status,_=api('GET','/storage/v1/object/public/mattia-album/'+paths[0])
        assert status in (400,401,403,404),('public media URL must fail',status)
        payload={'caption':'Synthetic caption','layout':'gallery','photo_settings':{'brightness':115,'fit':'contain'},'sort_order':5}
        status,result=api('PATCH','/rest/v1/album_media?id=eq.'+pids[0],tokens['owner'],payload)
        assert status==200 and len(result)==1,('owner metadata save',status)
        for role,photo in [('viewer',pids[0]),('contributor',pids[1]),('outsider',pids[0])]:
            status,result=api('PATCH','/rest/v1/album_media?id=eq.'+photo,tokens[role],{'caption':'Denied change'})
            assert status in (401,403) or result==[],(role,'metadata update must be denied',status)
        status,result=api('GET','/rest/v1/album_media?select=caption,layout,photo_settings,storage_path&id=eq.'+pids[0],tokens['owner'])
        assert status==200 and result[0]['caption']==payload['caption'] and result[0]['photo_settings']==payload['photo_settings']
        status,original=api('GET','/storage/v1/object/authenticated/mattia-album/'+paths[0],tokens['owner'])
        assert status==200 and original==IMAGE,'Original bytes changed'
        c.execute('update public.album_access set active=false where email=%s',(users['viewer']['email'],));conn.commit()
        status,role=api('POST','/rest/v1/rpc/album_role',tokens['viewer'],{})
        assert status==200 and role is None,'Revocation not effective'
        status,_=api('GET','/storage/v1/object/authenticated/mattia-album/'+paths[0],tokens['viewer'])
        print('Revoked viewer repeated request status:',status)
        fresh_status,_=api('GET','/storage/v1/object/authenticated/mattia-album/'+paths[0]+'?cacheNonce='+str(uuid.uuid4()),tokens['viewer'])
        print('Revoked viewer fresh request status:',fresh_status)
        assert fresh_status in (400,401,403,404),('Revoked viewer fresh download',fresh_status)
        unseen_status,_=api('GET','/storage/v1/object/authenticated/mattia-album/'+paths[1]+'?cacheNonce='+str(uuid.uuid4()),tokens['viewer'])
        assert unseen_status in (400,401,403,404),('Revoked viewer unseen download',unseen_status)
        print('PASS real API/Storage: chapter privacy, owner-only studio metadata, authenticated downloads, fresh requests denied after revocation, original bytes unchanged.')
        if status==200:print('KNOWN LIMIT: previously downloaded/cacheable responses can remain accessible; the app now uses cacheNonce and no-store for authenticated downloads.')
    finally:
        conn.rollback()
        if committed:
            if uploaded:
                status,_=api('DELETE','/storage/v1/object/mattia-album',tokens.get('owner'),{'prefixes':uploaded})
                assert status==200,('Synthetic storage cleanup failed',status)
            for token in tokens.values():api('POST','/auth/v1/logout?scope=global',token)
            c.execute('delete from public.album_media where id=any(%s::uuid[])',(pids,))
            c.execute('delete from public.album_memories where id=any(%s::uuid[])',(mids,))
            c.execute('delete from public.album_chapters where id=any(%s::smallint[])',(chapters,))
            c.execute('delete from public.album_access where email=any(%s)',([a['email'] for a in users.values()],))
            c.execute('delete from auth.users where id=any(%s::uuid[])',([a['id'] for a in users.values()],))
            conn.commit()
            c.execute('select count(*) from auth.users where id=any(%s::uuid[])',([a['id'] for a in users.values()],));assert c.fetchone()[0]==0
            c.execute("select count(*) from storage.objects where bucket_id='mattia-album' and name=any(%s)",(paths,));assert c.fetchone()[0]==0
            print('CLEANUP verified: isolated accounts, sessions, invitations, chapters, memories and synthetic files removed.')
        conn.close()

if __name__=='__main__':run()
