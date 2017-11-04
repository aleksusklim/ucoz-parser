//<ucoz-parser-7.js>//

"use strict";

// ==== функции для работы с базой ==== //

// Названия таблиц. Версия нужна, чтобы очищать и перестраивать базу.
var FORUMS='Forums',TOPICS='Topics',POSTS='Posts',USERS='Users',
Version=9;

// Подключается к единой базе и создаёт все нужные таблицы в ней.
// Асинхронно вызывает Done=function(Db), где Db - база данных.
// DatabaseConnect вызывается из DatabaseRequest.
function DatabaseConnect(Done){
var Idb=window.indexedDB||window.mozIndexedDB||window.webkitIndexedDB||window.msIndexedDB;
Idb=Idb.open('Spyro',Version);
Idb.onerror=function(Ev){console.log('DatabaseConnect error:',Ev);};
Idb.onsuccess=function(){Done(Idb.result);};
Idb.onupgradeneeded=function(Store){
Store=Store.target.result;
var Temp;
if(Store.objectStoreNames.contains(FORUMS))Store.deleteObjectStore(FORUMS);
Temp=Store.createObjectStore(FORUMS,{keyPath:'forum'});
if(Store.objectStoreNames.contains(TOPICS))Store.deleteObjectStore(TOPICS);
Temp=Store.createObjectStore(TOPICS,{keyPath:'topic'});
Temp.createIndex(FORUMS,'forum',{unique:false});
if(Store.objectStoreNames.contains(POSTS))Store.deleteObjectStore(POSTS);
Temp=Store.createObjectStore(POSTS,{keyPath:'post'});
Temp.createIndex(TOPICS,'topic',{unique:false});
Temp.createIndex(USERS,'user',{unique:false});
if(Store.objectStoreNames.contains(USERS))Store.deleteObjectStore(USERS);
Temp=Store.createObjectStore(USERS,{keyPath:'user'});
Temp.createIndex('name','name',{unique:false});
}};

// Запрос к базе. Сама открывает базу и создаёт транзакцию.
// Table- открываемая таблица, DoWrite - истина для записи или ложь для чтения,
// ErrStr - имя вызвавшей функции для сообщения об ошибке,
// Асинхронно вызывает тело для транзакции Process=function(Store,Request,GetAll),
// где в Store передаётся текущая открытая таблица, и нужно в обратку вызвать переданную же
// Request=function(Operation,Result), где Operation - запрос операции с транзакцией, на который
// будут автоматически повешены события, а готовый результат будет выдан через вызов
// Result=function(Data), где Data - то, что вернула успешная операция;
// если требуется операция .getAll, то надо вызывать GetAll=function(Method,Range,Result), где:
// Method - либо Store, либо Store.index(...), Range - аргумент для .getAll.
// DatabaseRequest вызывается из UpdateInTable,DeleteFromTable,PutToTable,GetByIndex,GetByKey
function DatabaseRequest(Table,DoWrite,ErrStr,Process){
if(!DatabaseRequest.Request)DatabaseRequest.Request=function(Operation,Result){
Operation.onerror=Operation.transaction?Operation.transaction.onerror:null;
Operation.onsuccess=function(Ev){return Result(Ev.target.result);};
};
if(!DatabaseRequest.GetAll)DatabaseRequest.GetAll=function(Method,Range,Result){
var Me,Cr=false;
if(Method.getAll)Me=Method.getAll(Range);
else if(Method.mozGetAll)Me=Method.mozGetAll(Range);
else{Me=Method.openCursor(Range);Cr=true;}
Me.onerror=Me.objectStore?(Me.objectStore.transaction?Me.objectStore.transaction.onerror:null):(Me.transaction?Me.transaction.onerror:null);
if(Cr){
var Rows=[];
Me.onsuccess=function(Ev){
var Cur=Ev.target.result;
if(Cur){Rows.push(Cur.value);Cur.continue();
}else Result(Rows);
};
}else Me.onsuccess=function(Ev){Result(Ev.target.result);};
}
return DatabaseConnect(function(Db){
var Trans=Db.transaction([Table],DoWrite?'readwrite':'readonly');
Trans.onerror=function(Ev){console.log(ErrStr,' error:',Ev);};
return Process(Trans.objectStore(Table),DatabaseRequest.Request,DatabaseRequest.GetAll);
});
}

// Читает из таблицы один объект по ключу, или возвращает все сразу.
// Table - имя таблицы, Key - ключ или null, чтобы вернуть все объекты,
// асинхронно вызывает Result=function(Obj), где Obj - объект из базы,
// либо Result=function(Arr), где Arr - массив объектов, если Key==null.
// GetByKey вызывается публично.
function GetByKey(Table,Key,Result){
return DatabaseRequest(Table,false,'GetByKey',function(Store,Request,GetAll){
if(Key!=null)return Request(Store.get(Key),Result);
return GetAll(Store,null,Result);
});
}

// Вытаскивает из таблицы по индексу, возвращает массив объектов с заданным индексом.
// Table - таблица, Index - имя индекса в ней, Value - значение индекса,
// асинхронно вызывает Result=function(Arr), где Arr - массив объектов из базы.
// GetByIndex вызывается публично.
function GetByIndex(Table,Index,Value,Result){
return DatabaseRequest(Table,false,'GetByIndex',function(Store,Request,GetAll){
return GetAll(Store.index(Index),Value,Result);
});
}

// Вставляет в таблицу все значения из массива, заменяя совпавшие по ключу.
// Table - имя таблицы, Values - массив добавляемых объектов,
// асинхронно вызывает Done=function() если задана.
// PutToTable вызывается публично.
function PutToTable(Table,Values,Done){
var Index=0,Max=Values.length;
if(Index>=Max)return Done?Done():null;
return DatabaseRequest(Table,true,'PutToTable',function(Store,Request,GetAll){
var Next=function(){
if(Index>=Max)return Done?Done():null;
return Request(Store.put(Values[Index++]),Next);
};
return Next();
});
}

// Удаляет из таблицы по ключам. Table - имя таблицы, Keys - массив ключей,
// асинхронно вызывает Done=function() если задана.
// DeleteFromTable вызывается публично.
function DeleteFromTable(Table,Keys,Done){
var Index=0,Max=Keys.length;
if(Index>=Max)return Done?Done():null;
return DatabaseRequest(Table,true,'DeleteFromTable',function(Store,Request,GetAll){
var Next=function(){
if(Index>=Max)return Done?Done():null;
return Request(Store.delete(Keys[Index++]),Next);
};
return Next();
});
};

// Добавляет объекты в таблицу, но если элемент с таким ключом уже есть - 
// вызывает внешнюю функцию для выбора или изменения объекта.
// Table - имя таблицы, Values - массив добавляемых объектов,
// на каждом конфликте вызывается Compare=function(Old,New), где
// Old - старый объект из базы, а New - новый добавляемый из массива Values,
// эта функция должна вернуть в итоге тот объект, который следует поместить в базу,
// то если либо старый, либо новый, либо созданный (или изенённый). Если
// вернуть null/ничего, то старый объект будет удалён из базы.
// По окончанию асинхронно вызывает Done=function() если задана.
// Эта функция менее предпочтительна, чем PutToTable или DeleteFromTable.
// UpdateInTable вызывается публично.
function UpdateInTable(Table,Values,Compare,Done){
var Index=0,Max=Values.length;
if(Index>=Max)return Done?Done():null;
return DatabaseRequest(Table,true,'UpdateInTable',function(Store,Request,GetAll){
var Next=function(){
if(Index>=Max)return Done?Done():null;
var New=Values[Index++];
if(!New)return Next();
var Key=New[Store.keyPath];
if(Key==undefined)return Next();
return Request(Store.get(Key),function(Old){
if(Old)New=Compare(Old,New);
if(New)return Request(Store.put(New),Next);
return Request(Store.delete(Key),Next);
});
};
return Next();
});
}

// ==== конец функций для работы с базой ==== //


// ==== функции для парсинга данных ==== //

// Парсит валидную XML-строку, в которой нет атрибутов, а только теги.
// xml - текст XML, root - корневой элемент, strings - массив листьев структуры.
// Возвращает дерево объектов. Каждый объект представляет XML-узел.
// Ключи объекта - имена вложенных узлов. Значения - массивы.
// В каждом массиве столько элементов, сколько узлом с одинаковым именем было
// найдено в родительском узле, обычно это всего один элемент.
// В каждом элементе массива - дочерний объект узла, либо строка, если это был лист.
// Пример использования:
// Data=ParseXML('+<t><a><x>1</x><y>2</y><x>3</x></a><b><c><y>4</y></c><c><y>5</y></c></b></t><n>-</n>','t',['x','y']);
function ParseXML(xml,root,strings){
var Unescape=function(text){
var m={'&amp;':'&','&lt;':'<'};
return text.replace(/(&amp;)|(&lt;)/g,function(x){return m[x];});
}
var Name=function(tag){return tag.replace(/[</>]/g,'');};
var Tag=function(tag,close){return '<'+(close?'/':'')+Name(tag)+'>';};
var Next=function(){
var p=xml.indexOf('<',pos);
if(p<0)return '';
var n=xml.indexOf('>',p);
if(n<0)return '';
pos=n+1;
return xml.substr(p+1,n-p-1).replace(/\s/g,'');
}
var Pair=function(next){
if(next.substr(-1)==='/')return '';
var p,r;
next=Tag(next,true);
p=xml.indexOf(next,pos);
if(p<0)return '';
r=xml.substr(pos,p-pos);
pos=p+next.length;
return Unescape(r);
}
var Top=function(arr){return arr[arr.length-1];}
var Add=function(name,val){
var s=Top(stack);
if(s[name])s[name].push(val);
else s[name]=[val];
}
var Lv={};
strings.map(function(v){Lv[Name(v)]=true;});
var pos,t,s,v,n,stack,res,last,p;
stack=[{}];
root=Name(root);
t=Tag(root);
pos=xml.indexOf(t);
if(pos<0)return null;
pos+=t.length;
while(true){
v=Next();
t=Tag(v);
n=Name(v);
s=Top(stack);
if(!s)return null;
if(v===''||n===root)break;
if(Lv[n])Add(n,Pair(v));
else if(v===n+'/')Add(n,{});
else if(v==='/'+n){
if(s['']!==n)return null;
delete s[''];
Add(n,stack.pop());
}else stack.push({'':n});
}
if(stack.length!==1)return null;
return stack.pop();
}

// Упрощает XML-дерево, полученное через ParseXML,
// если вы знаете, что именно желаете вытащить из него.
// xml - дерево, path - обрабатываемый путь в нём,
// each - истина, чтобы получить массив всех, а не один элемент.
// Путь - это строка, собранная из имён узлов через точки.
// Функция пройдёт по дереву, и соберёт только концы веток.
// Также, в пути могут быть символы вертикальной черты
// после узлов-массивов. Тогда всё, что дальше - будет рекурсивно
// обработано для каждого массива, и собрано в результат.
// Установка each в истину эквивалентна добавлению path+'|'.
// Пример: WalkXML(Data,'b.c|y'), Walk(Data,'a.x',true), где Data из примера для ParseXML.
var WalkXML=function(xml,path,each){
if(!xml)return null;
var p=path.indexOf('|');
if(p<0){
var a=false;
path.split('.').map(function(v){
if(v!==''){
if(a)xml=xml[0];
if(typeof(xml)!=='object'||!xml[v])return null;
else xml=xml[v];
a=true;
}
});
if(!a)return null;
if(each)return xml;
return xml[0];
}
var a=path.substr(0,p),b=path.substr(p+1);
var c=WalkXML(xml,a,true);
if(!c)return null;
if(b==='')return c;
return c.map(function(x){return WalkXML(x,b);});
}

// Экранирует строку для вставки как параметр HTML-аттрибута:
function EscapeAttr(text){
var m={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'};
return text.replace(/['<&>"]/g,function(x){return m[x];});
}

// Парсит любой HTML-код из строки.
// Возвращает линейный массив из объектов, которые представляют теги.
// Текстовые участки html также представлены объектами. Типы:
// {type:'txt',text:'_тектс_'} - для текстовых участков;
// {type:'com',text:'--_комметарий_--'} - коммантарий html, включая дефисы по краям;
// {type:'err',data:'_имя_тега_'} - для не-html тегов, начинающихся с !, / или ?
// {type:'tag',attr:[['_имя_атр1_','_знач_атр1_'],...],end:(_если_закрылся_),auto:(_если_одиночный_)}  - для тегов.
// Не проверяет правильность чего-либо!
function ParseHTML(html){ //http://w3c.github.io/html/syntax.html#prescan-a-byte-stream-to-determine-its-encoding
var pos,m;
var s=function(c){return(c===9||c===10||c===12||c===13||c===32);}
var a=function(){
var n,v,c,b
while(pos<m){
c=html.charCodeAt(pos);
if(s(c)||c===47)pos++;
else break;
}
if(pos>=m||html.charAt(pos)==='>')return ['',''];
n=v='';
while(pos<m){
c=html.charCodeAt(pos);
if(c===47||c===62)return [n,''];
if(s(c)){
while(pos<m){if(s(c))c=html.charCodeAt(++pos);else break;}
if(c!==61||pos>=m)return [n,''];
pos++;
break;
}
if(n!==''&&c===61){pos++;break;}
n+=html.charAt(pos++);
}
c=html.charCodeAt(pos);
while(pos<m){if(s(c))c=html.charCodeAt(++pos);else break;}
if(c===34||c===39){
b=html.charAt(pos);
while(++pos<m){
c=html.charAt(pos);
if(c===b){pos++;break;}
v+=c;
}
return [n,v];
}
if(c===62)return [n,''];
v+=html.charAt(pos);
while(++pos<m){
c=html.charCodeAt(pos);
if(s(c)||c===62)break;
v+=html.charAt(pos);
}
return [n,v];
};
var t,r;
var f=function(e){if(t)r.push({type:'txt',text:t});t='';if(e)r.push(e);};
if(!html)html='';
m=html.length;
var n,k,v,c,r,b;
pos=0;
r=[];
t='';
while(true){
n=html.indexOf('<',pos);
if(n<0){t+=html.substr(pos);break;}
t+=html.substr(pos,n-pos);
k=html.substr(n,4);
if(k==='<'+'!--'){
c=html.indexOf('--'+'>',n);
n+=4;
if(c<0){v=html.substr(n-2);pos=html.length;}
else{v=html.substr(n-2,c-n+4);pos=c+3;}
f({type:'com',text:v});
continue;
}
k=k.substr(1,2);
v=k.charCodeAt(0);
if(v===47)v=k.charCodeAt(1);
if(v>=65&&v<=90||v>=97&&v<=122){
pos=n+1;
v=html.charAt(pos);
while(++pos<m){
c=html.charCodeAt(pos);
if(s(c)||c===62)break;
v+=html.charAt(pos);
}
b=[];
while(true){
c=a();
if(!c[0])break;
b.push(c);
}
if(v.substr(-1)!=='/'&&html.charAt(pos-1)==='/')v+='/';
c={type:'tag'};
if(b.length>0)c.attr=b.concat();
if(v.charAt(0)==='/'){v=v.substr(1);c.end=true;}
if(v.substr(-1)==='/'){v=v.substr(0,v.length-1);c.auto=true;}
c.name=v;
f(c);
pos++;
continue;
}
k=k.substr(0,1);
if(k==='!'||k==='/'||k==='?'){
c=html.indexOf('>',n);
n++;
if(c<0)c=html.length;
v=html.substr(n,c-n);
f({type:'err',data:v});
pos=c+1;
continue;
}
n++;
t+='<';
pos=n;
}
f();
return r;
}

// Обрабатывает результаты ParseHTML,
// Приводит теги и имена атрибутов к нижнему регистру;
// разворачивает массив атрибутов, делая из него поимённый объект;
function PrepareHTML(html){
var r=[],a;
if(html)html.map(function(t){
switch(t.type){
case 'txt':case'com':if(t.text)r.push(t);break;
case 'err':if(t.data)r.push(t);break;
case 'tag':
if(!t.name)break;
t.name=t.name.toLowerCase();
if(t.attr){
a={};
t.attr.map(function(v){
a[v[0].toLowerCase()]=v[1];
});
t.attr=a;
}
r.push(t);
}
});
return r;
}


// Парсит CSS-строку из аттрибута <tag style="..." >
// Возвращает объект, ключи которого - имена CSS-свойств,
// а значения - строковое представление значений свойств.
function ParseCSS(css){//https://www.w3.org/TR/css-syntax-3/#parse-a-list-of-declarations0
if(!css)return {};
css=(css.replace(/\s+/g,' ')+'   ').split('').reverse();
var Consume_a_token=function(){
var token=css.pop();
switch(token){
case ' ':
return Consume_a_token();
case '"':case "'":
return Consume_a_string_token(token);
case '+':case '.':
if(Is_start_a_number()){css.push(token);return Consume_a_numeric_token();}
break;
case '-':
if(Is_start_a_number()){css.push(token);return Consume_a_numeric_token();}
if(Is_start_an_identifier()){css.push(token);return Consume_an_identlike_token();}
break;
case '/':
if(css[css.length-1]==='*'){
while(css.length>0){
token=css.pop();
if(token==='*'){
token=css.pop();
if(token==='/')return Consume_a_token();
}}
return [''];
}else break;
case '\\':
token=css.pop();
if(Is_a_valid_escape('\\',token)){css.push(token,'\\');return Consume_an_identlike_token();};
break;
case '':case '(':case ')':case '[':case ']':case '{':case '}':case ',':case ':':case ';':
return [token];
default:
if(Is_number(token)){css.push(token);return Consume_a_numeric_token();}
if(Is_letter(token)){css.push(token);return Consume_an_identlike_token();};
};
return ['T',token];
},Is_start_a_number=function(){
var m=css.length,a=css[m-1],b=css[m-2],c=css[m-3];
if(a==='+'||a==='-'){a=b;b=c;}
if(a==='.')a=b;
return Is_number(a);
},Is_start_an_identifier=function(){
var m=css.length,a=css[m-1],b=css[m-2],c=css[m-3];
if(a==='-'){a=b;b=c;}
if(Is_letter(a))return true;
return Is_a_valid_escape(a,b);
},Is_a_valid_escape=function(a,b){
if(a!=='\\')return false;
if(b===' ')return false;
return true;
},Consume_a_numeric_token=function(){
var s='',t,a,b,c,m,n;
t=css.pop();
if(t==='+'||t==='-'){s+=t;t=css.pop();}
while(Is_number(t)){s+=t;t=css.pop();}
if(t==='.'){
n=css[css.length-1];
if(Is_number(n)){
s+=t;
t=css.pop();
while(Is_number(t)){s+=t;t=css.pop();}
}}
n=css[css.length-1];
if(n==='e'||n==='E'){
n=css[css.length-2];
if(n==='+'||n==='-')n=css[css.length-3];
if(Is_number(n)){
t=css.pop();
t=css.pop();
while(Is_number(t)){s+=t;t=css.pop();}
}}
css.push(t);
return ['N',s];
},Consume_an_identlike_token=function(){
var t=Consume_a_name(),n=css[css.length-1];
if(t.toLowerCase()==='url'&&n==='('){css.pop();
var s='';
t=css.pop();
while(t===' ')t=css.pop();
if(css.length<1)return ['U',''];
if(t==='"'||t==="'"){
s=Consume_a_string_token(t);
while(css.length>0)if(css.pop()===')')break;
return ['U',s[1]];
}
while(css.length>0){
if(t===')')break;
s+=t;
t=css.pop();
}
return ['U',s];
}
if(n==='('){css.pop();return ['F',t];}
return ['I',t];
},Consume_a_name=function(){
var t,n,s='';
t=css.pop();
while(css.length>0){
if(Is_letter(t)||Is_number(t)||t==='-'){s+=t;t=css.pop();}else{
n=css[css.length-1];
if(Is_a_valid_escape(t,n)){Consume_an_escaped_code_point();t=css.pop();}
else{
css.push(t);return s;
}}}
return '';
},Consume_an_escaped_code_point=function(){
var t=css.pop(),s='';
if(Is_hex(t)){
s=t;
while(s.length<6){
t=css.pop();
if(!Is_hex(t)){if(t!==' ')css.push(t);break;}
s+=t;
}
s=+('0x'+s);
if(s>=0xD800&&s<=0xDFFF||s>0x10FFFF)s=0xFFFD;
return String.fromCharCode(s);
}
if(css.length<1)return String.fromCharCode(0xFFFD);
return t;
},Consume_a_string_token=function(e){
var t,n,s='';
while(css.length>0){
t=css.pop();
if(t===e)break;
if(t==='\\'){
n=css[css.length-1];
if(n===' ')continue;
if(Is_a_valid_escape('\\',n))t=Consume_an_escaped_code_point();
}
s+=t;
}
return ['S',s];
},
Is_number=function(t){if(!t)return false;return !!t.match(/[0-9]/);},
Is_letter=function(t){if(!t)return false;return !!t.match(/[a-zA-Z_]/);},
Is_hex=function(t){if(!t)return false;return !!t.match(/[a-fA-F]/);};
var r=[],t,d,n,v,block={'(':')','F':')','[':']','{':'}'};
while(css.length>0){
t=Consume_a_token();
if(!t)break;
switch(t[0]){
case '(':case '[':case '{':case 'F':
t=block[t];
while(css.length>0)if(Consume_a_token()[0]===t)break;
break;
case 'I':
d=[t];
while(css.length>0){
t=Consume_a_token();
if(t[0]===';')break;
d.push(t);
}
d.reverse();
t=d.pop();
n=t[1];
t=d.pop();
while(d.length>0)if(t[0]===' '||t[0]===''||t[0]==='T')t=d.pop();else break;
if(t[0]===':'){
v=[];
while(d.length>0)v.push(d.pop());
r.push([n,v]);
}}}
var h={};
r.map(function(e){
n='';
e[1].map(function(v){
switch(v[0]){
case 'I':n+=v[1]+' ';break;
case 'F':n+=v[1]+'(';break;
case 'S':n+='"'+v[1]+'" ';break;
case 'U':n+="url('"+v[1]+"') ";break;
case 'T':case 'N':if(v[1])n+=v[1];break;
default:
n+=v[0];
}});
h[e[0]]=n.trim();
});
return h;
}

// ==== конец функций для парсинга данных ==== //


function Html2Bb(html){
if(!html)return '';
var res='';
var add=function(text){if(text)res+=text;};
var stack={div:[],span:[],a:[]},css,str,i;
var CODE=false,CODEBODY=false,SPOILER=false,SPOILERTITLES=[],SPOILERTITLEHAVE=false,QUOTE=false,QUOTETITLE='',QUOTETITLEDONE,VIDEO=false,VIDEOURL='';
html.map(function(t){
if(t.type==='com'){
str=t.text;
t=str.replace(/[^a-zA-Z_\/]/g,'').toLowerCase();
switch(t){
case 'uzcode':CODE=true;CODEBODY=false;return;
case '/uzcode':CODE=false;CODEBODY=false;return;
case 'bbvideo':case 'bbaudio':VIDEO=true;VIDEOURL='';return;
case '/bbvideo':VIDEO=false;add('[video]'+VIDEOURL+'[/video]');VIDEOURL=false;return;
case '/bbaudio':VIDEO=false;add('[audio]'+VIDEOURL+'[/audio]');VIDEOURL=false;return;
case 'uspoiler':case '/ust':SPOILER=true;SPOILERTITLEHAVE=false;return;
case '/uspoiler':SPOILER=false;if(!SPOILERTITLEHAVE)SPOILERTITLES.push('');return add('[/spoiler]');
case 'uzquote':case '/uzq':QUOTE=true;QUOTETITLE=QUOTETITLEDONE='';return;
case '/uzquote':QUOTE=false;QUOTETITLE=QUOTETITLEDONE='';return add('[/quote]');
}
if(CODE){
if(t==='uzc'){CODEBODY=true;return add('[code]');}
if(t==='/uzc'){CODEBODY=false;return add('[/code]');}
}
if(QUOTE){
if(t==='qn'){QUOTETITLE=' ';QUOTETITLEDONE='';return;}
if(t==='/qn'){QUOTETITLEDONE=QUOTETITLE;QUOTETITLE='';return;}
if(t==='uzq'){QUOTE=false;QUOTETITLEDONE=QUOTETITLEDONE.trim();return add(QUOTETITLEDONE?'[quote='+QUOTETITLEDONE+']':'[quote]');}
return;
}
if(SPOILER){
if(t==='ust'){SPOILER=false;return add('<spoiler>');}
t=str.match(/--usn\(=([^)]*)\)--/);
if(t){SPOILERTITLES.push(t[1]);SPOILERTITLEHAVE=true;}
return;
}
}
if(t.type==='txt'){
if(VIDEO){
t=t.text.match(/'url':'(.*?)'/); 
if(t)VIDEOURL=t[1];
return;
}
if(CODE&&!CODEBODY)return;
if(QUOTE){
if(QUOTETITLE)QUOTETITLE+=t.text;
return;
}
return add(t.text);
}else if(t.type==='tag'){
if(CODE&&!CODEBODY)return;
if(QUOTE||VIDEO)return;
switch(t.name){
case 'br':return add('\n');
case 'hr':return add('[hr]');
case 'b':return add(t.end?'[/b]':'[b]');
case 'i':return add(t.end?'[/i]':'[i]');
case 'u':return add(t.end?'[/u]':'[u]');
case 's':return add(t.end?'[/s]':'[s]');
case 'sup':return add(t.end?'[/sup]':'[sup]');
case 'sub':return add(t.end?'[/sub]':'[sub]');
case 'ul':return add(t.end?'[/list]':'[list]');
case 'li':return add('[*]');
case 'img':return add('[img]'+(t.attr.src?t.attr.src:'#')+'[/img]');
case 'a':
if(t.end)return add(stack[t.name].pop());
if(t.attr.href){
str=t.attr.href.replace(/^\/go\?/,'');
if(str.match(/^mailto:/i)){
stack[t.name].push('[/mail]');
return add('[mail='+str.substr(7)+']');
}else{
stack[t.name].push('[/url]');
return add('[url='+str+']');
}}
return stack[t.name].push('');
case 'span':
if(t.end)return add(stack[t.name].pop());
str=t.attr.class
if(str){
if(str==='UhideBlock'){stack[t.name].push('[/hide]');return add('[hide]');}
if(str==='UhideBlockL'){stack[t.name].push(':[/hide]');return add('[hide]Hide: ');}
}
if(t.attr.style){
css=ParseCSS(t.attr.style);
str='';
if(css['font-size']){add('[size='+css['font-size'].replace(/[^0-9]/g,'')+']');str='[/size]';}
else if(css['font-family']){add('[font='+css['font-family']+']');str='[/font]';}
else if(css['color']){add('[color='+css['color']+']');str='[/color]';}
else if(css['text-decoration']==='overline'){add('[o]');str='[/o]';}
stack[t.name].push(str);
return;
}
case 'div':
if(t.end)return add(stack[t.name].pop());
if(t.attr.align){
str='';
switch(t.attr.align){
case 'left':add('[l]');str='[/l]';break;
case 'right':add('[r]');str='[/r]';break;
case 'center':add('[c]');str='[/c]';break;
case 'justify':add('[j]');str='[/j]';break;
}
stack[t.name].push(str);
}
return;
}}
});
SPOILERTITLES.reverse();
res=res.replace(/<spoiler>/g,function(x){
x=SPOILERTITLES.pop();
if(x)return '[spoiler='+x+']';
return '[spoiler]';
});
res=res.replace(/(&copy;)|(&reg;)|(&#153;)|</g,function(x){
return ({'&copy;':'(c)','&reg;':'(r)','&#153;':'(tm)','<':'&lt;'})[x];
});
res=res.replace(/\[url=([^\]]+)\](.+?)\[\/url\]/g,function(x,a,b){
if(a!==b)return x;
return '[url]'+a+'[/url]';
});
res=res.replace(/\[mail=([^\]]+)\](.+?)\[\/mail\]/g,function(x,a,b){
if(a!==b)return x;
return '[mail]'+a+'[/mail]';
})
return res;
}

function Bb2Html(bb){
var codes=[],stack={},CODE=false;
'b,i,s,u,o,l,c,r,j,sub,sup,size,color,font,hide,spoiler,video,audio,code,quote,url,email,img,list'.split(',').map(function(t){stack[t]=1;});

bb=bb.replace(/</g,'&lt;');
bb=bb.replace(
/\[(?:(\/?)([bisuolcrj]|su[bp]|hide|spoiler|video|audio|code|quote|url|email|img|list)|(hr|[*]|\/size|\/color|\/font)|((?:size|color|font|spoiler|quote|url|url|email)=)([^\]]+))\]/ig
,function(x,a,b,c,d,e){
var close=false,value='';
close=!!a;
code=b||c;
if(d){
value=e;
code=d.substr(0,d.length-1);
}
if(code.substr(0,1)==='/'){
code=code.substr(1);
close=true;
}
code=code.toLowerCase();
if(value){
switch(code){
case 'size':if(''+(+value.replace(/[^0-9]/g,''))!==value)return x;break;
case 'color':if(value.replace(/[^0-9a-z#]/g,'')!==value)return x;break;
case 'font':if(value.replace(/[^a-z0-9A-Z ]/g,'')!==value)return x;break;
//case 'spoiler':if(value.replace(/[^a-z0-9A-Z ]/g,''))!==value)return x;break;
}
}
if(close){
if(!stack[code]||stack[code]===1)return x;
stack[code]--;
}else if(stack[code]){
stack[code]++;
if()
}

//return '['+(close?'/':'')+code+']';



console.log(x,'<'+(close?'/':'')+code+(value?'='+value:'')+'>');
return ' < ';
});
return bb;
}



var RenderHTML=function(html){
if(!html)return '';
var a=function(m){
var r='';
for(var n in m)r+=' '+n+'="'+m[n]+'"';
return r;
}
var s='';
html.map(function(t){
switch(t.type){
case 'txt':s+=t.text;break;
case 'com':s+='<!'+t.text+'>';break;
case 'err':s+='<'+t.data+'>';break;
case 'tag':s+='<'+(t.end?'/':'')+t.name+a(t.attr)+(t.auto?' /':'')+'>';break;
}
});
return s;
}

var Namevalue=function(xml){
if(!xml)return null;
if(xml instanceof Array&&xml[0] instanceof Array)return xml.map(function(v){return Namevalue(v);});
var r={};
xml.map(function(x){
if(x.name&&x.value){
var v=x.value[0];
r[x.name[0]]=(v.string||v.strint||v.i4)[0];
}});
return r;
}

var Escape=function(html){
var m={'&':'&amp;','<':'&lt;','>':'&gt;'};
return (''+html)
.replace(/&#/g,'\ufffd')
.replace(/[<&>]/g,function(x){return m[x];})
.replace(/\ufffd/g,'&#');
}

var GetUrl=function(url,done,err){
var t=true,f=function(){if(t)err();t=false;};
var x=new XMLHttpRequest();
x.ontimeout=t;
x.onerror=t;
x.onabort=t;
x.open('GET',url,true);
x.onreadystatechange=function(){
if(+x.readyState===4){
if(+x.status===200)done(x.responseText||x.response);
else f();
}};x.send(null);};

var GetPath=function(path,done){
GetUrl('http://www.spyro-realms.com/api/'+path,function(xml){
done(ParseXML(xml,'methodResponse',['strint','string','name','i4']));
},function(){done(null);});
};

var GetCode=function(callback,forum,topic,page,mode,user,x){
if(typeof(forum)==='string'){
forum=forum.split('-');
topic=forum[1];
page=forum[2];
mode=forum[3];
user=forum[4];
x=forum[5];
forum=forum[0];
}
GetPath('forum/'+(forum||0)+'-'+(topic||0)+'-'+(page||0)+'-'+(mode||0)+'-'+(user||0)+'-'+(x||0),function(data){
callback(Namevalue(WalkXML(data,'params.param.value.array.data.value|struct.member|')));
});
}

var GetForumPage=function(forum,page,done){
GetCode(done,forum,0,page);
}

var GetTopicPage=function(topic,page,done){
GetCode(done,0,topic,page,42);
}

var GetForum=function(num,done){
num=+num;
if(!num)return;
var first=null,result=[],page=1;
var loop=function(data){
var hash=JSON.stringify(data);
if(!first)first=hash;
else if(first===hash)return done(result);
result=result.concat(data);
page++;
GetForumPage(num,page,loop);
}
GetForumPage(num,page,loop);
}

var DebugForum=function(data,ret){
var s='';
data.map(function(k){
s+='<table border="1">';
for(var n in k)s+='<tr><th>'+Escape(n)+'</th><td>'+(k[n])+'</td></tr>';
s+='</table><br>';
});
if(!ret)document.body.innerHTML=s;
return s;
}

var PrintCode=function(forum,topic,page,mode,user,x){
document.body.innerHTML='';
GetCode(DebugForum,forum,topic,page,mode,user,x);
}

var LinkTopicId=function(link){
link=link.match(/\/forum\/\d+-(\d+)-\d+/);
if(link)link=link[1];
return link;
}

var LinkForumId=function(link){
link=link.match(/\/forum\/(\d+)-?/);
if(link)link=link[1];
return link;
}


var LinkFrom=function(func,a,b,c,d,e){
return 'javascript:void('+func+'('+EscapeAttr(a+','+b+','+c+','+d+','+e)+'))';
}

var PrintTopicInfo=function(data,forum){
var s='',id;
id=LinkTopicId(data.TOPIC_LINK);
s+='['+data.LASTPOST_TIME+'] <b><a href="'+LinkFrom('LoadTopic',id,1,"'"+data.TOPIC_NAME+"'",data.TOPIC_PAGESNUM,forum)+'">'+data.TOPIC_NAME+'</a></b> / <a href="'+LinkFrom('LoadTopic',id,data.TOPIC_PAGESNUM,"'"+data.TOPIC_NAME+"'",data.TOPIC_PAGESNUM,forum)+'">'+data.TOPIC_PAGESNUM+'</a> (<i>'+data.TOPIC_DESCR+'</i>)<br>';
return '<div>'+s+'</div>';
}

var PrintPostInfo=function(data){
var s='';
s+='['+data.POST_DATE+', '+data.POST_TIME+'] <b>'+data.USER_NAME+'</b>:<br>';
s+='<blockquote>'+data.POST_MESSAGE+'</blockquote><hr>';
return '<div>'+s+'</div>';
}

var LoadForum=function(id){
var s='';
GetForum(id,function(arr){
arr.map(function(data){
s+=PrintTopicInfo(data,id);
});
document.body.innerHTML=s;
});
}

var LoadTopic=function(id,page,name,num,forum){
var s='',t=[];
for(var i=1;i<=num;i++)t.push(page==i?''+i:'<a href="'+LinkFrom('LoadTopic',id,i,"'"+name+"'",num,forum)+'">'+i+'</a>');
t='<b><a href="'+LinkFrom('LoadForum',forum)+'">'+name+'</a></b> ['+t.join(', ')+']';
s+=t+'<hr>';
GetTopicPage(id,page,function(arr){
arr.map(function(data){
s+=PrintPostInfo(data);
});
s+=t;
document.body.innerHTML=s;
});
}

window.LoadForum=LoadForum;
window.LoadTopic=LoadTopic;

// Логирует в консоль всё, что передано.
// Использовать как цель для асинхронных вызовов для отладки.
function Log(){console.log(arguments);return null;};
// Конструкторы для строчек таблиц базы данных: ("+" делает числовым тип)
function NewForum(forum,name,descr,topics,posts,time){return {forum:+forum,name:name,descr:descr,topics:+topics,posts:+posts,time:time};};
function NewTopic(topic,forum,name,descr,pages,posts,views,time){return {topic:+topic,forum:+forum,name:name,descr:descr,pages:+pages,posts:+posts,views:+views,time:+time};};
function NewPost(post,topic,user,text,time){return {post:+post,topic:+topic,user:+user,text:text,time:+time};};
function NewUser(user,name,ava,group,sign){return {user:+user,name:name,ava:ava,group:group,sign:sign};};

// Скачивает все ФОРУМЫ по номеру САЙТА, возвращает их. Пример: UpdateSite(14,Log);
var UpdateSite=function(num,done){
var r=[];
GetForum(num,function(arr){
arr.map(function(obj){
if(obj.FORUM_NAME)r.push(NewForum(LinkForumId(obj.FORUM_LINK),obj.FORUM_NAME,obj.FORUM_DESCR,obj.TOPIC_NUMS,obj.REPLIES_NUM,obj.LASTPOST_TIME));
});
done(r);
});
}

// Скачивает все ТЕМЫ по номеру ФОРУМА, возвращает их. Пример: UpdateForum(48,Log);
var UpdateForum=function(num,done){
var r=[];
GetForum(num,function(arr){
arr.map(function(obj){
if(!obj.FORUM_NAME)r.push(NewTopic(LinkTopicId(obj.TOPIC_LINK),num,obj.TOPIC_NAME,obj.TOPIC_DESCR,obj.TOPIC_PAGESNUM,obj.REPLIES_NUM,obj.VIEWS_NUM,obj.LASTPOST_TIMESTAMP));
});
done(r);
});
}

// Скачивает одну страницу ТЕМЫ по номеру, возвращает два массива: сообщения и пользователи.
// Если такой страницы нет, возвращает (null,null). Пример: UpdateTopicPage(11709,1,Log);
var UpdateTopicPage=function(num,page,done){
var p=[],u={};
GetTopicPage(num,page,function(arr){
if(!arr)return done(null,null);
arr.map(function(obj){
p.push(NewPost(obj.POST_ID,num,obj.USER_ID,obj.POST_MESSAGE,obj.POST_TIMESTAMP));
u[obj.USER_ID]=NewUser(obj.USER_ID,obj.USER_NAME,obj.USER_AVATAR,obj.USER_GROUPNAME,obj.USER_SIGNATURE);
});
var y=[];
for(var x in u)y.push(u[x]);
done(p,y);
});
}

// Скачивает всю ТЕМУ целиком по номеру, возвращает два массива:
// все сообщения из неё, и все пользователи. Пример: UpdateTopic(11709,Log);
var UpdateTopic=function(num,done){
var post={},user={};
var next=function(i){
UpdateTopicPage(num,i,function(p,u){
if(!p){
p=[];u=[];
for(var x in post)p.push(post[x]);
for(var y in user)u.push(user[y]);
return done(p,u);
}
p.map(function(x){post[x.post]=x;});
u.map(function(y){user[y.user]=y;});
next(i+1);
});
};
next(1);
}

// Качает и добавляет в базу все ФОРУМЫ по массиву номеров САЙТОВ.
// Возвращает их. Пример: UpdateForum([14,26],Log);
var PushSites=function(arr,done){
var r=[],i=0;
var next=function(){
if(i>=arr.length)return PutToTable(FORUMS,r,function(){if(done)done(r);});
UpdateSite(arr[i],function(data){
i++;
r=r.concat(data);
next();
});
};
next();
}

// Качает и добавляет в базу все ТЕМЫ по массиву номеров ФОРУМОВ.
// Возвращает их. Пример: PushTopics([48,18],Log);
var PushTopics=function(arr,done){
var r=[],i=0;
var next=function(){
if(i>=arr.length)return PutToTable(TOPICS,r,function(){if(done)done(r);});
UpdateForum(arr[i],function(data){
i++;
r=r.concat(data);
next();
});
};
next();
}

// Качает и добавляет в базу все ФОРУМЫ и все их ТЕМЫ по массиву номеров САЙТОВ.
// Возвращает полученные темы. Пример: PushSitesTopics([10],Log);
var PushSitesTopics=function(sites,done){
PushSites(sites,function(arr){
var r=[];
arr.map(function(v){r.push(v.forum);});
PushTopics(r,done);
});
}

// Качает и добавляет в базу все ПОСТЫ (и пользователей) из массива НОМЕРОВ ТЕМ.
// Возвращает их же, но возможно с повторами. Пример: PushPosts([12828,11633],Log);
var PushPosts=function(arr,done){
var p=[],u=[],i=0;
var next=function(){
if(i>=arr.length){
return PutToTable(USERS,u,function(){
PutToTable(POSTS,p,function(){done(p,u);});
});
};
UpdateTopic(arr[i],function(post,user){
i++;
p=p.concat(post);
u=u.concat(user);
next();
});
};
next();
}

var ReparseHTML=function(html){
return Html2Bb(PrepareHTML(ParseHTML(html)));
}

'';

window.Proc=function(){
document.getElementById('target').value=ReparseHTML(document.getElementById('source').value);
}

window.Proc=function(){
document.getElementById('target').value=Bb2Html(document.getElementById('source').value);
}

document.body.innerHTML='<style>textarea{width:90%;height:192px;}</style><textarea onchange="Proc();" id="source"></textarea><br /><textarea id="target"></textarea>';
'';



/*
PushTopics([48,18],Log);



GetByKey(FORUMS,null,Log); 

GetByKey(TOPICS,null,Log); 
GetByIndex(TOPICS,FORUMS,48,Log); 



UpdateInTable(FORUMS,[{forum:1}],function(o,n){
console.log(o,n);
return o;
});



UpdateInTable(FORUMS,[16,40,48],function(d){
//console.log(d);
d.descr='!'+d.descr;
return d;

});
GetByKey(FORUMS,null,Log); 


DeleteFromTable(FORUMS,[40],Log);



/////////////////



/*

LoadForum(48);





// скачать и сохранить все форумы и все их темы их 14-го и 26-го сайта:
PushSitesTopics([14,26],Log);

// полностью скачать и сохранить все сообщения (и пользователей) следующих тем:
PushPosts([11529,11672,12828],Log);

// посмотреть на содержимое базы:
GetByKey(FORUMS,null,Log); // все форумы
GetByKey(TOPICS,null,Log); // все темы
GetByKey(POSTS,null,Log); // все посты
GetByKey(USERS,null,Log); // все пользователи

// получить одну запись из базы:
GetByKey(FORUMS,15,Log); //  форум по номеру
GetByKey(TOPICS,11732,Log); // тема по номеру
GetByKey(POSTS,196868,Log); // пост по номеру
GetByKey(USERS,5363,Log); // пользователь по номеру

// фильтры по индексу:
GetByIndex(TOPICS,FORUMS,48,Log); // темы из данного форума
GetByIndex(POSTS,TOPICS,12828,Log); // посты из данной темы
GetByIndex(POSTS,USERS,3244,Log); // посты от данного пользователя
GetByIndex(USERS,'name','aleksusklim',Log); // пользователь по имени

*/

/*
UpdateSite(14,Log);
UpdateForum(48,Log);
UpdateTopicPage(11709,1,Log);

PushSites([14,26],Log);
PushTopics([48,18],Log);
PushSitesTopics([14,26],Log);

GetByKey(FORUMS,null,Log);

UpdateTopic(11709,Log);

UpdateTopicPage(11709,3,Log);

PushPosts([12828,11633],Log);


//LoadForum(18);
// GetForum(14,DebugForum)
// GetTopicPage(11709,1,DebugForum)

UpdateTopic(11709,Log);


UpdateTopicPage(11709,1,function(p,u){
PutToTable(USERS,u,function(){
PutToTable(POSTS,p,Log);
});
});

*/
'';



//EOF