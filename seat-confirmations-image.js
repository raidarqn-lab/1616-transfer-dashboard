// Re-encode screenshots to remove metadata and keep private attachments bounded.
export const maxImageInputBytes=15*1024*1024;
export function validateSeatImage(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Object.assign(Error('Choose JPG, PNG or WebP.'),{code:'invalid_image'});
 if(file.size>maxImageInputBytes)throw Object.assign(Error('Image too large.'),{code:'image_too_large'});
}
export async function prepareSeatImage(file){
 validateSeatImage(file);let bitmap;
 try{
  bitmap=await createImageBitmap(file);if(!bitmap.width||!bitmap.height)throw Error('Invalid dimensions');
  const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [.9,.8,.65,.5]){const image=canvas.toDataURL('image/jpeg',quality);if(image.startsWith('data:image/jpeg;base64,')&&image.length<=1200000)return image;}
  throw Object.assign(Error('Image too large.'),{code:'image_too_large'});
 }catch(error){if(error.code==='image_too_large')throw error;throw Object.assign(Error('Invalid image.'),{code:'invalid_image'});}
 finally{bitmap?.close();}
}
