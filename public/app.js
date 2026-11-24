const $=id=>document.getElementById(id);
const money=(n)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(n)||0);
let proposals=[],editingId=null,activeShareToken=null;
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3200)}
async function api(url,options={}){const res=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Request failed');return data}
function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dateLabel(v){return new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
function statusClass(s){return s==='Approved'?'approved':s==='Draft'?'draft':s==='In review'?'review':'sent'}
function renderRows(target,query='',status=''){const rows=proposals.filter(p=>(p.title+' '+p.client_name).toLowerCase().includes(query.toLowerCase())&&(!status||p.status===status));$(target).innerHTML=rows.length?rows.map(p=>'<tr><td><strong>'+escapeHtml(p.title)+'</strong><small>PR-'+String(p.id).padStart(4,'0')+'</small></td><td>'+escapeHtml(p.client_name)+'</td><td><strong>'+money(p.amount)+'</strong></td><td>'+dateLabel(p.updated_at)+'</td><td><span class="status '+statusClass(p.status)+'">'+p.status+'</span></td><td><button class="row-actions" title="Open proposal" onclick="openProposal('+p.id+')">···</button></td></tr>').join(''):'<tr><td colspan="6" class="empty">No proposals yet. Create your first proposal to get started.</td></tr>'}
function refreshDashboard(){renderRows('proposalRows',$('search').value,$('statusFilter').value);renderRows('proposalRows2',$('search2').value);$('totalCount').textContent=proposals.length;$('pendingCount').textContent=proposals.filter(p=>p.status==='Sent'||p.status==='In review').length;const approved=proposals.filter(p=>p.status==='Approved');$('approvedValue').textContent=money(approved.reduce((n,p)=>n+Number(p.amount),0));$('approvalRate').textContent=proposals.length?Math.round(approved.length/proposals.length*100)+'%':'0%'}
function go(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===page));document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('crumb').textContent=({dashboard:'Overview',proposals:'Proposals',builder:'Proposal builder',client:'Client preview',settings:'Settings'})[page]||'Overview';window.scrollTo(0,0)}
window.openProposal=function(id){const p=proposals.find(x=>String(x.id)===String(id));if(!p)return;editingId=p.id;$('templateSelect').value='';$('titleInput').value=p.title;$('clientInput').value=p.client_name;$('emailInput').value=p.client_email||'';$('priceInput').value=p.amount;$('currencyInput').value='INR';$('statusInput').value=p.status||'Sent';$('deleteProposal').style.display='inline-flex';loadActivity(p.id);$('timelineInput').value=p.timeline||'';$('overviewInput').value=p.overview||'';$('deliverablesInput').value=(p.deliverables||[]).join('\n');$('saveProposal').textContent='Update proposal';showShare(p);syncPreview();go('builder')};
function showShare(p){$('shareResult').style.display='block';$('shareResult').innerHTML='Saved permanently. Client link: <a target="_blank" rel="noopener" href="?share='+encodeURIComponent(p.share_token)+'">Open share link</a> · <button class="row-actions" id="copyShare">Copy link</button>';$('copyShare').onclick=()=>copyShare(p.share_token);loadActivity(p.id)}
async function loadActivity(id){try{const items=await api('/api/proposals/'+id+'/activity');$('activityPanel').style.display='block';$('activityPanel').innerHTML='<strong>Client activity</strong>'+(items.length?items.map(x=>'<p><b>'+ (x.action==='approved'?'Approved':'Requested changes') +'</b> · '+dateLabel(x.created_at)+(x.comment?'<br>'+escapeHtml(x.comment):'')+'</p>').join(''):'<p>No client responses yet.</p>')}catch(e){$('activityPanel').textContent=e.message}}
async function copyShare(token){const link=location.origin+location.pathname+'?share='+token;try{await navigator.clipboard.writeText(link);toast('Client link copied to clipboard.')}catch{prompt('Copy this client link:',link)}}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
function newProposal(){editingId=null;$('templateSelect').value='';$('titleInput').value='';$('clientInput').value='';$('emailInput').value='';$('overviewInput').value='';$('priceInput').value='0';$('currencyInput').value='INR';$('statusInput').value='Draft';$('timelineInput').value='';$('deliverablesInput').value='';$('saveProposal').textContent='Save proposal';$('deleteProposal').style.display='none';$('shareResult').style.display='none';$('activityPanel').style.display='none';syncPreview();go('builder')}
const proposalTemplates={
 cybersecurity:{
  title:'Cybersecurity Assessment & Security Improvement Proposal',
  overview:'Assess the organisation’s security posture, identify and prioritise risks, and provide a practical roadmap to improve protection across infrastructure, applications, cloud environments, and user access.',
  timeline:'3–5 weeks',
  deliverables:['Discovery and scope confirmation','External attack-surface review','Vulnerability assessment and risk prioritisation','Cloud, identity, and access security review','Findings report with remediation guidance','Executive summary and security improvement roadmap']
 },
 'web-development':{
  title:'Website Design & Development Proposal',
  overview:'Plan, design, and develop a responsive, user-friendly website aligned with the client’s brand and business goals. The work includes agreed page layouts, core functionality, quality checks, and launch support.',
  timeline:'4–6 weeks',
  deliverables:['Requirements gathering and project sitemap','Website wireframes and visual design','Responsive front-end development','Content and agreed functionality integration','Cross-device and browser testing','Deployment, handover, and launch support']
 }
};
$('templateSelect').addEventListener('change',e=>{
 const template=proposalTemplates[e.target.value];
 if(!template)return;
 $('titleInput').value=template.title;
 $('overviewInput').value=template.overview;
 $('timelineInput').value=template.timeline;
 $('deliverablesInput').value=template.deliverables.join('\n');
 syncPreview();
});
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>b.dataset.go==='builder'?newProposal():go(b.dataset.go)));
$('search').addEventListener('input',e=>renderRows('proposalRows',e.target.value,$('statusFilter').value));
$('statusFilter').addEventListener('change',e=>renderRows('proposalRows',$('search').value,e.target.value));
$('search2').addEventListener('input',e=>renderRows('proposalRows2',e.target.value));
function syncPreview(){const title=$('titleInput').value||'Untitled proposal',client=$('clientInput').value||'Your client',price=money($('priceInput').value),timeline=$('timelineInput').value||'To be confirmed';$('prevTitle').textContent=title;$('prevClient').textContent=client;$('prevPrice').textContent=price;$('prevTimeline').textContent=timeline;$('clientTitle').textContent=title;$('clientName').textContent=client;$('clientPrice').textContent=price;$('clientTimeline').textContent=timeline;$('clientOverview').textContent=$('overviewInput').value;$('clientDeliverables').innerHTML=$('deliverablesInput').value.split('\n').filter(Boolean).map(x=>'<li>'+escapeHtml(x)+'</li>').join('')}
['titleInput','clientInput','priceInput','timelineInput','overviewInput','deliverablesInput'].forEach(id=>$(id).addEventListener('input',syncPreview));
function proposalPayload(){return {title:$('titleInput').value.trim(),client_name:$('clientInput').value.trim(),client_email:$('emailInput').value.trim(),overview:$('overviewInput').value,amount:Number($('priceInput').value)||0,currency:'INR',status:$('statusInput').value,timeline:$('timelineInput').value,deliverables:$('deliverablesInput').value.split('\n').map(x=>x.trim()).filter(Boolean)}}
$('saveProposal').addEventListener('click',async()=>{try{const payload=proposalPayload();if(!payload.title||!payload.client_name)return toast('Add a proposal title and client name first.');const p=editingId?await api('/api/proposals/'+editingId,{method:'PATCH',body:JSON.stringify(payload)}):await api('/api/proposals',{method:'POST',body:JSON.stringify(payload)});const i=proposals.findIndex(x=>String(x.id)===String(p.id));if(i>=0)proposals[i]=p;else proposals.unshift(p);editingId=p.id;$('saveProposal').textContent='Update proposal';refreshDashboard();showShare(p);toast('Proposal saved to the database.')}catch(e){toast(e.message)}});
$('previewProposal').addEventListener('click',()=>{syncPreview();go('client')});
async function submitDecision(action){if(!activeShareToken)return;try{await api('/api/public/'+encodeURIComponent(activeShareToken)+'/decision',{method:'POST',body:JSON.stringify({action,comment:$('feedbackText').value})});toast(action==='approved'?'Approval saved. Thank you!':'Your change request was sent.');$('clientFeedback').style.display='none';$('approve').disabled=true;$('requestChanges').disabled=true;$('clientOverview').insertAdjacentHTML('afterend','<p style="color:#07835e;font-weight:700">Your response has been recorded.</p>')}catch(e){toast(e.message)}}
$('approve').addEventListener('click',()=>submitDecision('approved'));
$('requestChanges').addEventListener('click',()=>{$('clientFeedback').style.display='block';$('feedbackText').focus()});
$('sendFeedback').addEventListener('click',()=>submitDecision('changes_requested'));
$('saveSettings').addEventListener('click',()=>toast('Workspace preferences saved.'));
async function loadAdmin(){try{proposals=await api('/api/proposals');refreshDashboard()}catch(e){toast(e.message)}}
async function loadPublic(token){activeShareToken=token;document.querySelector('.sidebar').style.display='none';document.querySelector('.topbar').style.display='none';document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));$('client').classList.add('active');$('client').querySelector('.welcome').style.display='none';try{const p=await api('/api/public/'+encodeURIComponent(token));$('clientTitle').textContent=p.title;$('clientName').textContent=p.client_name;$('clientOverview').textContent=p.overview;$('clientPrice').textContent=money(p.amount);$('clientTimeline').textContent=p.timeline;$('clientDeliverables').innerHTML=(p.deliverables||[]).map(x=>'<li>'+escapeHtml(x)+'</li>').join('');if(p.status==='Approved'||p.status==='In review'){$('approve').disabled=true;$('requestChanges').disabled=true;$('clientFeedback').insertAdjacentHTML('beforebegin','<p style="color:#07835e;font-weight:700">Current status: '+p.status+'</p>')}document.title=p.title+' — Proposal'}catch(e){$('clientTitle').textContent='Proposal unavailable';$('clientOverview').textContent=e.message;$('approve').disabled=true;$('requestChanges').disabled=true}}
async function start(){const share=new URLSearchParams(location.search).get('share');if(share){await loadPublic(share);return}syncPreview();await loadAdmin()}
start();
$('currencyInput').addEventListener('change',syncPreview);
$('statusInput').addEventListener('change',syncPreview);
$('deleteProposal').addEventListener('click',async()=>{if(!editingId)return;if(!confirm('Delete this proposal permanently? Its client link and activity history will also be removed.'))return;try{await api('/api/proposals/'+editingId,{method:'DELETE'});proposals=proposals.filter(p=>String(p.id)!==String(editingId));editingId=null;$('deleteProposal').style.display='none';$('saveProposal').textContent='Save proposal';$('shareResult').style.display='none';$('activityPanel').style.display='none';refreshDashboard();go('proposals');toast('Proposal deleted.')}catch(e){toast(e.message)}});
