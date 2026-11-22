"use strict";
const USERNAME=/^[a-z0-9_]{3,24}$/;
function normalizeUsername(value){
  return String(value??"").trim().replace(/^@/,"").toLowerCase();
}
function isValidUsername(value){
  return typeof value==="string"&&USERNAME.test(value);
}
module.exports={normalizeUsername,isValidUsername};
