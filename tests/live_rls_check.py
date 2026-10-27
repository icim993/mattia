"""Real RLS tests. All fixtures and attempted writes are rolled back.

Requires MATTIA_DB_PASSWORD_FILE outside the repository; never prints credentials.
No DDL, migration, real owner changes, or real media downloads.
"""
import json
import os
from pathlib import Path
import re
import uuid
import psycopg2
from psycopg2 import sql

def connect():
    raw = Path(os.environ['MATTIA_DB_PASSWORD_FILE']).read_text(encoding='utf-8-sig').strip()
    match = re.fullmatch(r'(?i)(?:[^:]{0,20}(?:pwd|pass\w*|database|db|supabase)[^:]{0,20}):\s*(\S+)\s*', raw)
    password = match[1] if match else raw
    return psycopg2.connect(host='aws-1-eu-central-1.pooler.supabase.com', port=5432,
        dbname='postgres', user='postgres.bwdvwkspoxqquzolxact', password=password,
        sslmode='require', connect_timeout=10)

def run():
    conn=connect()
    users={role:str(uuid.uuid4()) for role in ['owner','viewer','contributor','outsider']}
    memories=[str(uuid.uuid4()) for _ in range(3)]
    photos=[str(uuid.uuid4()) for _ in range(2)]
    note=str(uuid.uuid4())
    try:
        c=conn.cursor()
        c.execute("set local statement_timeout = '8s'")
        c.execute("select relname,relrowsecurity from pg_class where oid in ('public.album_access'::regclass,'public.album_chapters'::regclass,'public.album_memories'::regclass,'public.album_media'::regclass,'public.guestbook_private'::regclass)")
        assert all(row[1] for row in c.fetchall()),'RLS must be enabled'
        c.execute("select id,public from storage.buckets where id in ('foto','mattia-album')")
        buckets=dict(c.fetchall());assert buckets=={'foto':False,'mattia-album':False},'Buckets must remain private'
        for role,uid in users.items():
            email='rls-'+uid+'@example.invalid'
            c.execute('insert into auth.users(id,email,email_confirmed_at) values(%s,%s,now())',(uid,email))
            if role!='outsider':c.execute('insert into public.album_access(email,role) values(%s,%s)',(email,role))
        c.execute('select value from generate_series(-32000,-31000) value where not exists(select 1 from public.album_chapters where id=value) limit 2')
        opened,hidden=[row[0] for row in c.fetchall()]
        for id_,visible in [(opened,True),(hidden,False)]:
            c.execute('insert into public.album_chapters(id,slug,title,visible) values(%s,%s,%s,%s)',(id_,'rls-'+str(uuid.uuid4()),'Collaudo RLS temporaneo',visible))
        for mid,cid,uid in [(memories[0],opened,users['owner']),(memories[1],hidden,users['owner']),(memories[2],opened,users['contributor'])]:
            c.execute('insert into public.album_memories(id,chapter_id,title,created_by) values(%s,%s,%s,%s)',(mid,cid,'Fixture RLS',uid))
        paths=[]
        for index,uid in [(0,users['owner']),(1,users['contributor'])]:
            mid=memories[0 if index==0 else 2];path=f'{uid}/{mid}/fixture.png';paths.append(path)
            c.execute("insert into public.album_media(id,memory_id,created_by,storage_path,media_kind,mime_type) values(%s,%s,%s,%s,'image','image/png')",(photos[index],mid,uid,path))
            c.execute("insert into storage.objects(bucket_id,name) values('mattia-album',%s)",(path,))
        foto='rls-'+str(uuid.uuid4())+'.png'
        c.execute("insert into storage.objects(bucket_id,name) values('foto',%s)",(foto,))
        c.execute('insert into public.guestbook_private(id,nome,testo,canzone) values(%s,%s,%s,%s)',(note,'Fixture RLS','Testo privato di prova','Canzone di prova'))
        count=0
        def check(role,query,params,expected,deny=False):
            nonlocal count
            c.execute('savepoint role_check')
            try:
                dbrole='anon' if role=='anon' else 'authenticated'
                c.execute(sql.SQL('set local role {}').format(sql.Identifier(dbrole)))
                claims={'role':dbrole}
                if role!='anon':claims['sub']=users[role]
                c.execute("select set_config('request.jwt.claims',%s,true)",(json.dumps(claims),))
                c.execute(query,params)
                rows=c.fetchall()
                assert rows==expected,(role,'unexpected fixture visibility/update')
                count+=1
            except psycopg2.errors.InsufficientPrivilege:
                if not deny:raise
                count+=1
            finally:
                c.execute('rollback to savepoint role_check');c.execute('release savepoint role_check')
        for role in [*users,'anon']:
            allowed=role in ('owner','viewer','contributor')
            check(role,'select id::text from public.album_memories where id=%s',(memories[0],),[(memories[0],)] if allowed else [],deny=not allowed)
            check(role,'select id::text from public.album_memories where id=%s',(memories[1],),[(memories[1],)] if role=='owner' else [],deny=not allowed)
            check(role,'select id::text from public.guestbook_private where id=%s',(note,),[(note,)] if role=='owner' else [],deny=role!='owner')
            for photo in photos:
                check(role,"update public.album_media set caption='Updated test' where id=%s returning id::text",(photo,),[(photo,)] if role=='owner' else [],deny=role!='owner')
            check(role,"select name from storage.objects where bucket_id='foto' and name=%s",(foto,),[(foto,)] if role=='owner' else [],deny=role!='owner')
            check(role,"select name from storage.objects where bucket_id='mattia-album' and name=%s",(paths[0],),[(paths[0],)] if allowed else [],deny=not allowed)
            check(role,"update public.album_memories set body='Test' where id=%s returning id::text",(memories[0],),[(memories[0],)] if role=='owner' else [],deny=role!='owner')
        check('contributor',"update public.album_memories set body='Own test' where id=%s returning id::text",(memories[2],),[(memories[2],)])
        for role in ['contributor','viewer','outsider']:
            check(role,'select email from public.album_access where email=%s',('rls-'+users['owner']+'@example.invalid',),[])
        check('anon','select testo,foto from public.messages where id=%s',(note,),[(None,None)])
        print(f'PASS: {count} real RLS checks across owner/viewer/contributor/outsider/anon; private buckets verified.')
    finally:
        conn.rollback();conn.close()
        print('ROLLBACK complete: no committed users, media, memories or schema changes.')

if __name__=='__main__':run()
