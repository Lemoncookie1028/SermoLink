// Fixed SermoLink app.js - tabs fixed + avatar presets (20)
const firebaseConfig = {
  apiKey: "AIzaSyDBAZUmEG3M35dY_upPn8qYx0i2POhcmw8",
  authDomain: "sermolink.firebaseapp.com",
  projectId: "sermolink",
  storageBucket: "sermolink.firebasestorage.app",
  messagingSenderId: "960323297325",
  appId: "1:960323297325:web:aa5f36f37a6a961c7b98a4",
  measurementId: "G-XKNFX885XW"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// UI refs - safe selectors (some pages may not have all elements)
const displayNameEl = document.getElementById('displayName');
const displayEmailEl = document.getElementById('displayEmail');
const miniAvatar = document.getElementById('miniAvatar');
const profileBtn = document.getElementById('profileBtn');
const signOutBtn = document.getElementById('signOutBtn');
const tabs = Array.from(document.querySelectorAll('.tab') || []);
const listPanel = document.getElementById('listPanel');
const searchUser = document.getElementById('searchUser');
const sendRequestBtn = document.getElementById('sendRequest');
const convoList = document.getElementById('convoList');
const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendMsgBtn = document.getElementById('sendMsg');
const chatTitle = document.getElementById('chatTitle');
const reqCountEl = document.getElementById('reqCount');

let currentUser = null;
let activeChatId = null;
let messagesUnsub = null;
let listeners = {};

// helpers
function chatIdFor(a,b){ return [a,b].sort().join('_'); }
function escapeHtml(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// render helpers for tabs
function renderFriendsTab(){
  if(!currentUser) return;
  listPanel.innerHTML = '<div class="small muted">Loading friends...</div>';
  db.collection('users').doc(currentUser.uid).collection('friends').get().then(snap=>{
    listPanel.innerHTML='';
    if(snap.empty) return listPanel.innerHTML='<div class="small muted">No friends yet</div>';
    snap.forEach(d=>{
      const f = d.data();
      const div = document.createElement('div'); div.className='convo-item';
      div.innerHTML = `<div style="flex:1"><strong class='friend-name' data-uid='${f.uid}'>${escapeHtml(f.displayName)}</strong><div class="muted">${escapeHtml(f.username||'')}</div></div>`;
      const unread = document.createElement('span'); unread.className='unread-dot'; unread.style.display='none';
      div.appendChild(unread);
      const msgBtn = document.createElement('button'); msgBtn.className='btn'; msgBtn.textContent='Message';
      msgBtn.onclick = ()=>openDmWith(f.uid, f.displayName);
      div.appendChild(msgBtn);
      listPanel.appendChild(div);
      // attach click for profile
      div.querySelector('.friend-name').addEventListener('click', e=> window.open('profile.html?uid='+f.uid,'_blank'));
      // check unread
      const id = chatIdFor(currentUser.uid, f.uid);
      db.collection('dms').doc(id).get().then(dsnap=>{
        if(dsnap.exists){ const data = dsnap.data(); const u = (data.unread && data.unread[currentUser.uid])||0; if(u>0) unread.style.display='inline-block'; }
      });
    });
  }).catch(e=> listPanel.innerHTML = '<div class="small muted">Error loading friends</div>');
}

function renderRequestsTab(){
  if(!currentUser) return;
  listPanel.innerHTML = '<div class="small muted">Loading requests...</div>';
  db.collectionGroup('friendRequests').where('receiver','==', currentUser.uid).get().then(snap=>{
    listPanel.innerHTML='';
    if(snap.empty) return listPanel.innerHTML='<div class="small muted">No requests</div>';
    snap.forEach(d=>{
      const r = d.data();
      const div = document.createElement('div'); div.className='convo-item';
      div.innerHTML = `<div style="flex:1"><strong>${escapeHtml(r.senderName)}</strong><div class="muted">${escapeHtml(r.sender)}</div></div>`;
      const accept = document.createElement('button'); accept.className='btn'; accept.textContent='Accept';
      const decline = document.createElement('button'); decline.className='btn'; decline.style.marginLeft='6px'; decline.textContent='Decline';
      accept.onclick = ()=>acceptRequest(d.ref);
      decline.onclick = ()=>declineRequest(d.ref);
      div.appendChild(accept); div.appendChild(decline);
      listPanel.appendChild(div);
    });
  }).catch(e=> listPanel.innerHTML = '<div class="small muted">Error loading requests</div>');
}

function renderDmsTab(){
  if(!currentUser) return;
  listPanel.innerHTML = '<div class="small muted">Loading DMs...</div>';
  db.collection('dms').where('participants','array-contains', currentUser.uid).get().then(snap=>{
    listPanel.innerHTML='';
    if(snap.empty) return listPanel.innerHTML = '<div class="small muted">No DMs yet</div>';
    snap.forEach(d=>{
      const data = d.data();
      const other = data.participants.find(p=>p!==currentUser.uid);
      const div = document.createElement('div'); div.className='convo-item';
      div.innerHTML = `<div style="flex:1"><strong>${escapeHtml(data.title||other)}</strong><div class="muted">${escapeHtml(data.lastMessage||'')}</div></div>`;
      div.onclick = ()=>openChat(d.id, other);
      listPanel.appendChild(div);
    });
  }).catch(e=> listPanel.innerHTML = '<div class="small muted">Error loading DMs</div>');
}

// tab switching
tabs.forEach(t=> t.addEventListener('click', ()=>{
  tabs.forEach(x=>x.classList.remove('active')); t.classList.add('active');
  const tab = t.dataset.tab;
  if(tab==='friends') renderFriendsTab();
  if(tab==='requests') renderRequestsTab();
  if(tab==='dms') renderDmsTab();
}));

// basic auth + setup
auth.onAuthStateChanged(async user=>{
  currentUser = user;
  if(!user){
    if(!location.pathname.endsWith('home.html')) window.location.href = 'home.html';
    return;
  }
  if(displayNameEl) displayNameEl.textContent = user.displayName || 'User';
  if(displayEmailEl) displayEmailEl.textContent = user.email || '';
  if(miniAvatar) miniAvatar.textContent = (user.displayName||'U').slice(0,1).toUpperCase();
  if(miniAvatar) miniAvatar.addEventListener('click', ()=> window.open('profile.html?uid='+currentUser.uid,'_blank'));
  if(profileBtn) profileBtn.addEventListener('click', ()=> window.location.href = 'profile.html');
  try{
    await db.collection('users').doc(user.uid).set({ uid: user.uid, displayName: user.displayName||'', email: user.email||'', username: (user.displayName||user.email||'').split(' ')[0].toLowerCase() }, { merge: true });
  }catch(e){ console.error(e); }
  // initial tab render
  const active = document.querySelector('.tab.active');
  if(active){
    if(active.dataset.tab==='friends') renderFriendsTab();
    if(active.dataset.tab==='requests') renderRequestsTab();
    if(active.dataset.tab==='dms') renderDmsTab();
  }
  // update req count realtime
  listeners.fr = db.collectionGroup('friendRequests').where('receiver','==', currentUser.uid).onSnapshot(snap=>{
    if(reqCountEl) reqCountEl.textContent = snap.size ? '('+snap.size+')' : '';
  });
});

// send friend request
if(sendRequestBtn) sendRequestBtn.addEventListener('click', async ()=>{
  const q = (searchUser.value||'').trim().toLowerCase();
  if(!q) return alert('Enter username');
  try{
    const found = await db.collection('users').where('username','==', q).get();
    if(found.empty) return alert('User not found');
    const doc = found.docs[0]; const data = doc.data();
    if(data.uid === currentUser.uid) return alert('Cannot add yourself');
    const reqRef = db.collection('users').doc(data.uid).collection('friendRequests').doc();
    await reqRef.set({ sender: currentUser.uid, senderName: currentUser.displayName || '', receiver: data.uid, receiverName: data.displayName || '', status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    alert('Friend request sent to ' + (data.displayName || data.username || data.uid));
    searchUser.value='';
    // if requests tab active, refresh
    if(document.querySelector('.tab.active').dataset.tab === 'requests') renderRequestsTab();
  }catch(e){ alert('Error sending request'); }
});

// accept/decline helpers
async function acceptRequest(ref){
  try{
    const r = (await ref.get()).data();
    if(!r) return;
    const sender = r.sender; const receiver = r.receiver;
    const sdoc = await db.collection('users').doc(sender).get();
    const rdoc = await db.collection('users').doc(receiver).get();
    const s = sdoc.data(); const rr = rdoc.data();
    await db.collection('users').doc(sender).collection('friends').doc(receiver).set({ uid: receiver, displayName: rr.displayName||'', username: rr.username||'' });
    await db.collection('users').doc(receiver).collection('friends').doc(sender).set({ uid: sender, displayName: s.displayName||'', username: s.username||'' });
    await ref.delete();
    alert('Friend added');
    renderFriendsTab();
    renderRequestsTab();
  }catch(e){ alert('Error accepting'); }
}
async function declineRequest(ref){ await ref.delete(); alert('Request declined'); renderRequestsTab(); }

// DMs - open/create
async function openDmWith(uid, name){
  const id = chatIdFor(currentUser.uid, uid);
  const dref = db.collection('dms').doc(id);
  const dsnap = await dref.get();
  if(!dsnap.exists){
    await dref.set({ id, participants: [currentUser.uid, uid], title: name, lastMessage: '', lastUpdated: firebase.firestore.FieldValue.serverTimestamp(), unread: {} });
  }
  openChat(id, uid, name);
}

async function openChat(dmid, otherUid, otherName){
  if(messagesUnsub) messagesUnsub();
  activeChatId = dmid;
  if(chatTitle) chatTitle.textContent = otherName || dmid;
  if(messagesEl) messagesEl.innerHTML = '<div class="small muted">Loading messages...</div>';
  const msgsCol = db.collection('dms').doc(dmid).collection('messages');
  messagesUnsub = msgsCol.orderBy('createdAt').onSnapshot(snap=>{
    if(!messagesEl) return;
    messagesEl.innerHTML='';
    snap.forEach(m=>{
      const md = m.data();
      const div = document.createElement('div'); div.className='msg '+(md.from===currentUser.uid?'me':'them');
      div.textContent = md.text;
      messagesEl.appendChild(div);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
  try{ await db.collection('dms').doc(dmid).update({ ['unread.'+currentUser.uid]: 0, lastRead: firebase.firestore.FieldValue.serverTimestamp() }); }catch(e){}
}

// send message
if(sendMsgBtn) sendMsgBtn.addEventListener('click', async ()=>{
  const text = (messageInput.value||'').trim();
  if(!text || !activeChatId) return;
  const msgsCol = db.collection('dms').doc(activeChatId).collection('messages');
  await msgsCol.add({ text, from: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  const dref = db.collection('dms').doc(activeChatId);
  const dsnap = await dref.get();
  if(dsnap.exists){
    const data = dsnap.data();
    const unread = data.unread || {};
    data.participants.forEach(p=>{ if(p!==currentUser.uid) unread[p] = (unread[p]||0)+1; });
    await dref.update({ lastMessage: text, lastUpdated: firebase.firestore.FieldValue.serverTimestamp(), unread });
  }
  if(messageInput) messageInput.value='';
});

// cleanup on unload
window.addEventListener('beforeunload', ()=>{ Object.values(listeners).forEach(u=>u && typeof u === 'function' && u()); });
