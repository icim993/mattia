/* Shared, non-destructive photo rendering for book and studio. */
(function () {
  'use strict';
  const bounds = {x:[0,100,50],y:[0,100,50],zoom:[1,1.8,1],rotate:[-15,15,0],brightness:[70,135,100],contrast:[70,140,100],saturation:[0,160,100],sepia:[0,100,0],grayscale:[0,100,0]};
  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    const result = {fit:source.fit === 'cover' ? 'cover' : 'contain'};
    for (const [key,[min,max,fallback]] of Object.entries(bounds)) {
      const number = source[key] == null ? NaN : Number(source[key]);
      result[key] = Number.isFinite(number) ? Math.min(max,Math.max(min,number)) : fallback;
    }
    return result;
  }
  function apply(img,value) {
    const s=normalize(value);
    img.style.objectFit=s.fit;
    img.style.objectPosition=`${s.x}% ${s.y}%`;
    img.style.transformOrigin=`${s.x}% ${s.y}%`;
    img.style.transform=`scale(${s.zoom}) rotate(${s.rotate}deg)`;
    img.style.filter=`brightness(${s.brightness}%) contrast(${s.contrast}%) saturate(${s.saturation}%) sepia(${s.sepia}%) grayscale(${s.grayscale}%)`;
  }
  window.MattiaPhoto={normalize,apply};
})();
