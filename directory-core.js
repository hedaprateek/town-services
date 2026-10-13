/* Shared, dependency-free service labels and search: browser and Node. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.ServiceDirectory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var services=[
    ['plumber','Plumber','प्लंबर','प्लंबर',['plumbing','leaking tap','tap repair','water leak','nal','नल','नळ','नळ दुरुस्ती','पानी का रिसाव','पाणी गळती']],
    ['electrician','Electrician','इलेक्ट्रीशियन','वीजतंत्री',['electrical','electric repair','wiring','light repair','bijli','बिजली','वीज','इलेक्ट्रिशियन']],
    ['maid','Maid','घरेलू सहायिका','घरकाम मदतनीस',['house maid','domestic help','bai','kaamwali','कामवाली','बाई','घरकाम']],
    ['cook','Cook','रसोइया','स्वयंपाकी',['cooking','rasoi','khana banana','रसोई','खाना बनाना','स्वयंपाक','आचारी']],
    ['driver','Driver','ड्राइवर','वाहनचालक',['driving','car driver','चालक','ड्रायव्हर']],
    ['carpenter','Carpenter','बढ़ई','सुतार',['carpentry','furniture repair','sutar','badhai','फर्नीचर','फर्निचर','लाकूडकाम']],
    ['lifttechnician','Lift Technician','लिफ्ट तकनीशियन','लिफ्ट तंत्रज्ञ',['lift repair','elevator','लिफ्ट','लिफ्ट दुरुस्ती']],
    ['pestcontrol','Pest Control','कीट नियंत्रण','कीटक नियंत्रण',['pest','termites','cockroaches','दीमक','झुरळ','किडे']],
    ['housekeeping','Housekeeping','सफाई सेवा','स्वच्छता सेवा',['cleaning service','building cleaning','सफाई','स्वच्छता']],
    ['gardener','Gardener','माली','माळी',['gardening','garden','mali','बगीचा','बागकाम']],
    ['watertanker','Water Tanker','पानी का टैंकर','पाण्याचा टँकर',['tanker','water supply','पानी टैंकर','पाणी टँकर','टँकर','टैंकर']],
    ['electricityboard','Electricity Board','बिजली विभाग','वीज मंडळ',['power cut','power outage','electricity complaint']],
    ['gasagency','Gas Agency','गैस एजेंसी','गॅस एजन्सी',['gas cylinder','gas delivery','गैस','गॅस','सिलेंडर']],
    ['societymanager','Society Manager','सोसायटी प्रबंधक','सोसायटी व्यवस्थापक',['building manager']],
    ['accountant','Accountant','लेखाकार','लेखापाल',['accounts','accounting','हिसाब','लेखा']],
    ['carcleaning','Car Cleaning','कार की सफाई','गाडी स्वच्छता',['car wash','car washing','गाड़ी की सफाई','गाडी धुणे']],
    ['babysitter','Baby Sitter','बच्चों की देखभाल','बालसंगोपन',['babysitting','child care','nanny','मुलांची देखभाल']]
  ];
  var categories=[
    ['Repairs & Maintenance','मरम्मत और रखरखाव','दुरुस्ती व देखभाल'],
    ['Building Services','इमारत की सेवाएँ','इमारत सेवा'],
    ['Utilities','पानी, बिजली और गैस','पाणी, वीज व गॅस'],
    ['Society Staff','सोसायटी कर्मचारी','सोसायटी कर्मचारी'],
    ['Home Help','घर के काम में मदद','घरकाम मदत']
  ];
  function normalize(value){return String(value||'').normalize('NFKC').toLowerCase()
    .replace(/[.,!?;:()[\]{}"'\/\\—–_-]+/g,' ').replace(/\s+/g,' ').trim();}
  function definition(role){var value=normalize(role);return services.find(function(s){
    return [s[0],s[1],s[2],s[3]].concat(s[4]).some(function(label){return normalize(label)===value;});});}
  function label(role,lang){var s=definition(role);return s?s[lang==='hi'?2:lang==='mr'?3:1]:String(role||'');}
  function category(value,lang){var c=categories.find(function(c){return normalize(c[0])===normalize(value);});
    return c?c[lang==='hi'?1:lang==='mr'?2:0]:String(value||'');}
  var aliases=[];
  services.forEach(function(s){[s[1],s[2],s[3]].concat(s[4]).forEach(function(a){aliases.push([normalize(a),s[0]]);});});
  aliases.sort(function(a,b){return b[0].length-a[0].length;});
  function query(value){var result=' '+normalize(value)+' ';
    aliases.forEach(function(a){result=result.split(' '+a[0]+' ').join(' '+a[1]+' ');});return normalize(result);}
  function index(row,role){var s=definition(role),values=Object.keys(row).map(function(k){return row[k];});
    var c=categories.find(function(c){return values.some(function(value){return normalize(value)===normalize(c[0]);});});
    var numbers=Object.keys(row).filter(function(key){return /^(phone|mobile|cell|tel|contactno|number)$/.test(normalize(key).replace(/\s/g,''));})
      .map(function(key){return phone(row[key]).replace(/^\+/,'');}).join(' ');
    return normalize(values.join(' ')+' '+numbers+' '+(s?[s[0],s[1],s[2],s[3]].join(' '):'')+' '+(c?c.join(' '):''));}
  function matches(hay,value){
    function all(text){return text.split(' ').every(function(word){return hay.indexOf(word)!==-1;});}
    return all(normalize(value)) || all(query(value));
  }
  function phone(value){var raw=String(value||'').trim();if(!raw||!/^[+()\d\s.-]+$/.test(raw))return '';
    var digits=raw.replace(/\D/g,'');return digits.length>=3&&digits.length<=15?(raw.charAt(0)==='+'?'+':'')+digits:'';}
  function rank(role){var s=definition(role);return s?services.indexOf(s):services.length;}
  // Phone numbers and notes can be corrected without losing a saved contact.
  function contactId(contact){return JSON.stringify(contact.id ? ['id',String(contact.id)]
    : ['contact',normalize(contact.name),normalize(contact.role),normalize(contact.category)]);}
  function vcard(contact){
    function escape(value){return String(value||'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n')
      .replace(/;/g,'\\;').replace(/,/g,'\\,');}
    function fold(line){
      var parts=[],part='',bytes=0,encoder=new TextEncoder();
      Array.from(line).forEach(function(char){var size=encoder.encode(char).length;
        if(bytes+size>75){parts.push(part);part=' ';bytes=1;}part+=char;bytes+=size;});
      parts.push(part);return parts.join('\r\n');
    }
    var lines=['BEGIN:VCARD','VERSION:3.0','FN:'+escape(contact.name),'N:;'+escape(contact.name)+';;;'];
    var number=phone(contact.phone);if(number)lines.push('TEL;TYPE=VOICE:'+number);
    if(contact.role)lines.push('TITLE:'+escape(contact.role));
    if(contact.url)lines.push('URL:'+escape(contact.url));
    if(contact.notes)lines.push('NOTE:'+escape(contact.notes));
    lines.push('END:VCARD');return lines.map(fold).join('\r\n')+'\r\n';
  }
  return {normalize:normalize,label:label,category:category,index:index,matches:matches,phone:phone,rank:rank,
    contactId:contactId,vcard:vcard};
});
