import * as THREE from "https://esm.sh/three@0.170.0";
// Content hashes change automatically when a model changes. A failed manifest
// request falls back to the original URL instead of breaking a model loader.
let versions={};
try {
  const response=await fetch("/asset-versions.json",{cache:"no-cache",signal:AbortSignal.timeout(4000)});
  if(response.ok)versions=await response.json();
} catch(error) { console.debug("Cache de modelos: usando URLs originais.",error); }
THREE.DefaultLoadingManager.setURLModifier(raw=>{
  try {
    const url=new URL(raw,location.href);
    if(url.origin===location.origin&&versions[url.pathname]){
      url.searchParams.set("assetv",versions[url.pathname]);
      return url.href;
    }
  } catch(_) {}
  return raw;
});
