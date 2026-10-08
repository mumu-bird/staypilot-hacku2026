/** Display estimate only; this does not establish taxes, inventory or a payable quote. */
export function displayPriceCents(value:unknown):number|null{
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)return null;
 const cents=Math.round(value*100);return Number.isSafeInteger(cents)?cents:null;
}
