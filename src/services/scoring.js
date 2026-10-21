import { escHtml } from '../shared/dom.js';

function norm(s){return (s||'').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g,'').toLowerCase();}
function analyze(raw){
  const nChars=[],nIdx=[];
  for(let i=0;i<raw.length;i++){const c=raw[i];
    if(/[\u4e00-\u9fffA-Za-z0-9]/.test(c)){nChars.push(c.toLowerCase());nIdx.push(i);}}
  return {raw,nChars,nIdx};
}
function diffScore(A,B){
  const a=A.nChars,b=B.nChars,n=a.length,m=b.length;
  const dp=[];for(let i=0;i<=n;i++)dp.push(new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)
    dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const mA=new Array(n).fill(false),mB=new Array(m).fill(false);
  let i=0,j=0;
  while(i<n&&j<m){if(a[i]===b[j]){mA[i]=true;mB[j]=true;i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}
  const matched=dp[0][0];
  const rec=m?matched/m:1,pre=n?matched/n:0;
  return {mA,mB,f1:(rec+pre)>0?2*rec*pre/(rec+pre):0};
}
function renderDiff(an,unmatched,cls){
  const pos=new Map();an.nIdx.forEach((ri,k)=>pos.set(ri,k));
  let out='';
  for(let i=0;i<an.raw.length;i++){const c=an.raw[i];
    if(pos.has(i)&&unmatched[pos.get(i)])out+=`<span class="${cls}">${escHtml(c)}</span>`;
    else out+=escHtml(c);}
  return out;
}

export { norm, analyze, diffScore, renderDiff };
