export const maxJsonBodyBytes=65536;
export class RequestInputError extends Error {
 status:number;
 constructor(message:string,status:number){super(message);this.status=status;}
}
export async function readJsonBody(stream:AsyncIterable<Uint8Array|string>,limit=maxJsonBodyBytes):Promise<unknown>{
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of stream){const bytes=Buffer.from(chunk);size+=bytes.byteLength;if(size>limit)throw new RequestInputError('请求内容过大，请缩短输入后重试。',413);chunks.push(bytes);}
 const text=Buffer.concat(chunks).toString('utf8');
 if(!text)return {};
 try{return JSON.parse(text);}catch{throw new RequestInputError('请求格式不正确，请刷新页面后重试。',400);}
}
