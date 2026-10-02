import {qrcodegen} from './vendor/qrcodegen.mjs';
export function drawQR(canvas,text){
  const qr=qrcodegen.QrCode.encodeText(text,qrcodegen.QrCode.Ecc.MEDIUM);
  const border=4,scale=5,size=(qr.size+border*2)*scale;
  // Whole screen pixels per module avoid uneven bars after CSS downscaling.
  const modules=qr.size+border*2,available=Math.min(280,canvas.parentElement.clientWidth||280);
  canvas.style.width=modules*Math.max(1,Math.floor(available/modules))+'px';
  canvas.width=canvas.height=size;
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,size,size);context.fillStyle='#000';
  for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))context.fillRect((x+border)*scale,(y+border)*scale,scale,scale);
}
