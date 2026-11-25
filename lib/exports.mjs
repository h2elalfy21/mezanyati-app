import { rowKind } from './transactions.mjs';

export const exportHeaders=['التاريخ','النوع','التصنيف','العملة','المبلغ','الملاحظة'];
const typeLabels={income:'دخل',expense:'مصروف',debt:'دين / التزام'};
export const exportFields=(row)=>{
 const amount=Number(row.amount);
 const kind=rowKind(row);
 return [
  row.occurred_on??'',
  Object.hasOwn(typeLabels,kind)?typeLabels[kind]:'غير مصنّف',
  row.category||'بدون تصنيف',
  row.currency??'',
  row.amount!=null&&String(row.amount).trim()&&Number.isFinite(amount)?amount:'',
  row.note??'',
 ];
};

const encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,i)=>{
 for(let bit=0;bit<8;bit++)i=i&1?(i>>>1)^0xedb88320:i>>>1;
 return i;
});
function crc32(bytes){
 let crc=0xffffffff;
 for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];
 return (crc^0xffffffff)>>>0;
}
function header(length,fields){
 const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);
 for(const [size,offset,value] of fields)view['setUint'+size](offset,value,true);
 return bytes;
}
// An uncompressed ZIP is sufficient for the five small OOXML workbook parts.
function zip(files){
 const stored=[],directory=[];
 let offset=0,dirSize=0;
 for(const [path,content] of files){
  const name=encoder.encode(path),data=encoder.encode(content),size=data.length,crc=crc32(data);
  const local=header(30,[[32,0,0x04034b50],[16,4,20],[16,12,33],[32,14,crc],[32,18,size],[32,22,size],[16,26,name.length]]);
  const entry=header(46,[[32,0,0x02014b50],[16,4,20],[16,6,20],[16,14,33],[32,16,crc],[32,20,size],[32,24,size],[16,28,name.length],[32,42,offset]]);
  stored.push(local,name,data);directory.push(entry,name);
  offset+=local.length+name.length+size;dirSize+=entry.length+name.length;
 }
 const end=header(22,[[32,0,0x06054b50],[16,8,files.length],[16,10,files.length],[32,12,dirSize],[32,16,offset]]);
 return new Blob([...stored,...directory,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

const clean=(text)=>Array.from(String(text),char=>{
 const cp=char.codePointAt(0);
 if(cp===9||cp===10||cp===13||(cp>=0x20&&cp<=0xd7ff)||(cp>=0xe000&&cp<=0xfffd)||cp>=0x10000)return char;
 return '';
}).join('').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r/g,'&#13;');
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const office='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels='http://schemas.openxmlformats.org/package/2006/relationships';
const contentType='application/vnd.openxmlformats-officedocument.spreadsheetml.';
const xml=(s)=>'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+s;
export function makeXlsx(rows){
 if(rows.length>=1048576)throw Error('Excel row limit exceeded');
 const rowXml=[exportHeaders,...rows.map(exportFields)].map((row,i)=>{
  const rowNo=i+1;
  return '<row r="'+rowNo+'">'+row.map((cell,col)=>{
   const ref=String.fromCharCode(65+col)+rowNo;
   // Never turn user-entered strings into formulas, links or macros.
   return typeof cell==='number'
    ?'<c r="'+ref+'"><v>'+cell+'</v></c>'
    :'<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+clean(cell)+'</t></is></c>';
  }).join('')+'</row>';
 }).join('');
 return zip([
  ['[Content_Types].xml',xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="'+contentType+'sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="'+contentType+'worksheet+xml"/></Types>')],
  ['_rels/.rels',xml('<Relationships xmlns="'+rels+'"><Relationship Id="rId1" Type="'+office+'/officeDocument" Target="xl/workbook.xml"/></Relationships>')],
  ['xl/workbook.xml',xml('<workbook xmlns="'+ns+'" xmlns:r="'+office+'"><bookViews><workbookView/></bookViews><sheets><sheet name="سجل العمليات" sheetId="1" r:id="rId1"/></sheets></workbook>')],
  ['xl/_rels/workbook.xml.rels',xml('<Relationships xmlns="'+rels+'"><Relationship Id="rId1" Type="'+office+'/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')],
  ['xl/worksheets/sheet1.xml',xml('<worksheet xmlns="'+ns+'"><dimension ref="A1:F'+(rows.length+1)+'"/><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="5" width="22" customWidth="1"/><col min="6" max="6" width="45" customWidth="1"/></cols><sheetData>'+rowXml+'</sheetData>'+(rows.length?'<autoFilter ref="A1:F'+(rows.length+1)+'"/>':'')+'</worksheet>')],
 ]);
}

