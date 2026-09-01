export function downloadFile(url:string,fileName?:string){
  const link=document.createElement("a");link.href=url;if(fileName)link.download=fileName;document.body.appendChild(link);link.click();link.remove();
}
export async function copyText(text:string){await navigator.clipboard.writeText(text)}
