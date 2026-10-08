export function readiness(input:{production:boolean;frontendExists:boolean;shuttingDown:boolean}){
 const ready=!input.shuttingDown&&(!input.production||input.frontendExists);
 return {status:ready?'ready':'unavailable',frontendReady:!input.production||input.frontendExists,shuttingDown:input.shuttingDown,realTransactionEnabled:false} as const;
}
