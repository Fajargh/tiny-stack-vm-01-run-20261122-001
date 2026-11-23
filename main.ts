import{mkdirSync as m,readdirSync as d,readFileSync as r,writeFileSync as w}from'fs';
const{MAKEFUN_INPUT_DIR:I='/input',MAKEFUN_OUTPUT_DIR:O='/output'}=process.env;
const B=['X+Y','X-Y','Math.imul(X,Y)','X/Y','X%Y','U/V','U%V',0,'X&Y','X|Y','X^Y',0,'X<<Y','X>>Y','X>>>Y',0,'X==Y','X<Y','U<V'],K=[7,14,2,4,1,3];
function run(p,g){
const D=new Int32Array(256),C=[],M=new Int32Array(256),o=new Uint8Array(65536),n=p.length;
let s=0,c=0,l=0,i=0,f=0,v=0;
const z=a=>[o.slice(0,l),a];
for(;;){
if(f<0||f>=n)return z(9);
const a=p[f];
if(a>>4>5||(a&15)>K[a>>4])return z(5);
const h=a==1?1:a==2?4:a>47&&a<52?2:0;
if(f+h>=n)return z(9);
const x=f+1+h;
f=x;
if(!a)return z(0);
if(a==1||a==2){if(s>255)return z(3);D[s++]=a==1?p[x-1]<<24>>24:p.readInt32LE(x-4);}
if(a==3)s--;
if(a==4){if(s>255)return z(3);D[s]=D[s-1],s++;}
if(a==5)v=D[s-1],D[s-1]=D[s-2],D[s-2]=v;
if(a==7)[D[s-3],D[s-2],D[s-1]]=[D[s-2],D[s-1],D[s-3]];
if(B[a-16]){const X=D[s-2],Y=D[s-1],U=X>>>0,V=Y>>>0;if(a>18&&a<23&&!Y)return z(4);D[s-2]=eval(B[a-16]);s--;}
if(a==23)D[s-1]=-D[s-1]|0;
if(a==27)D[s-1]=~D[s-1];
if(a>47&&a<51){if(a==48||(v=D[--s],a==49?!v:v))f=x+p.readInt16LE(x-2);}
if(a==51){C[c++]=x;f=p[x-2]|p[x-1]<<8;}
if(a==52){if(!c)return z(8);f=C[--c];}
if(a==64||a==65){if(D[s-1]>>>0>255)return z(6);if(a==64)D[s-1]=M[D[s-1]];else{M[D[s-1]]=D[s-2];s-=2;}}
if(a==80){const k=''+D[--s];if(l+k.length>65536)return z(11);o.set(Buffer.from(k),l);l+=k.length;}
if(a==81){if(l>65535)return z(11);o[l++]=D[--s]&255;}
if(a==82){if(s>255)return z(3);D[s++]=i<g.length?g[i++]:-1;}
if(a==83)return z(D[--s]&255);
}
}
for(const j of d(I)){
const[a,b]=run(r(I+'/'+j+'/program.bin'),r(I+'/'+j+'/input.bin'));
m(O+'/'+j,{recursive:true});
w(O+'/'+j+'/stdout.bin',a);
w(O+'/'+j+'/exit.txt',b+'\n');
}
