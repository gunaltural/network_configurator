/* Verification evidence is deliberately separate from operational pass/fail analysis. */
(()=>{
 const phases=['baseline','post-change','diagnostic'], sources=['live','mock','manual'], reviews=['pending','accepted','issue'];
 function redact(value,secrets=[]){
   let s=String(value||'');
   for(const secret of secrets.filter(x=>String(x).length))s=s.split(String(secret)).join('[REDACTED]');
   return s.replace(/(^.*\b(?:password|passwd|secret|token|private-key|auth-password|priv-password|key-string)\b).*$/gim,'$1 [REDACTED]')
     .replace(/(^\s*(?:snmp-server|snmp-agent)\s+community\b).*$/gim,'$1 [REDACTED]')
     .replace(/(^\s*(?:tacacs|radius)[^\n]*\bkey\b).*$/gim,'$1 [REDACTED]')
     .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[REDACTED PRIVATE KEY]');
 }
 function normalize(items,secrets=[]){
   return (Array.isArray(items)?items:[]).slice(-12).filter(x=>x&&typeof x==='object').map(x=>({
     id:String(x.id||'').slice(0,80),module:String(x.module||'').slice(0,80),platform:String(x.platform||'').slice(0,80),
     target:redact(x.target,secrets).slice(0,253),observedAt:String(x.observedAt||'').slice(0,50),
     phase:phases.includes(x.phase)?x.phase:'diagnostic',source:sources.includes(x.source)?x.source:'manual',
     review:reviews.includes(x.review)?x.review:'pending',
     commands:(Array.isArray(x.commands)?x.commands:[]).slice(0,100).map(c=>redact(c,secrets).slice(0,300)),
     output:redact(x.output,secrets).slice(0,40000),truncated:!!x.truncated||String(x.output||'').length>40000,
     expected:redact(x.expected,secrets).slice(0,2000),assessment:redact(x.assessment,secrets).slice(0,2000)
   }));
 }
 function labels(tr){return tr?{title:'Doğrulama kanıtları',boundary:'Komut çıktıları tek başına servis sağlığını veya kabulü kanıtlamaz. Değerlendirme mühendis girdisidir; mock ve manuel çıktılar canlı cihaz doğrulaması sayılmaz.',baseline:'Ön kontrol', 'post-change':'Son kontrol',diagnostic:'Tanılama',live:'Canlı SSH',mock:'Mock / örnek çıktı',manual:'Mühendis tarafından eklenen çıktı',pending:'İnceleme bekliyor',accepted:'Mühendis tarafından kabul edildi',issue:'Mühendis tarafından sorun kaydedildi',device:'Cihaz / hedef',time:'Kayıt zamanı',source:'Kaynak',review:'Mühendis değerlendirmesi',expected:'Beklenen sonuç',assessment:'Değerlendirme notu',commands:'Komutlar',truncated:'Çıktı kısaltılmıştır; tam kanıt olarak değerlendirilmemelidir.'}:{title:'Verification evidence',boundary:'Command output alone does not prove service health or acceptance. Review is engineer input; mock and manually supplied output do not constitute live device verification.',baseline:'Pre-check','post-change':'Post-check',diagnostic:'Diagnostic',live:'Live SSH',mock:'Mock / sample output',manual:'Engineer-supplied output',pending:'Awaiting review',accepted:'Accepted by engineer',issue:'Issue recorded by engineer',device:'Device / target',time:'Recorded at',source:'Source',review:'Engineer review',expected:'Expected result',assessment:'Assessment note',commands:'Commands',truncated:'Output was truncated; do not treat it as complete evidence.'};}
 window.VerificationEvidence={redact,normalize,labels};
})();
