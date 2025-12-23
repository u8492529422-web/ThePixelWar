import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const CANVAS_SIZE = 1000; 
const BLOCKS_PER_ROW = 100; 
const BLOCK_SIZE = CANVAS_SIZE / BLOCKS_PER_ROW; // 10px

const LINK_SINGLE = "https://buy.stripe.com/test_9B614mdAidvn44o6trb7y00"; 

function App() {
  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const viewportRef = useRef(null);
  
  const [pixels, setPixels] = useState([]);
  const [session, setSession] = useState(null);
  const [pixelsSold, setPixelsSold] = useState(0);

  const [zoom, setZoom] = useState(1);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 100, h: 100 });

  // États Auth (Header & Modale)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  
  // États Sign Up (Modale "Perfect")
  const [showSignUp, setShowSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [signEmail, setSignEmail] = useState('');
  const [signPass, setSignPass] = useState('');
  const [signError, setSignError] = useState('');

  // 1. Initialisation
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    fetchPixels();
  }, []);

  // 2. Zoom Auto
  useEffect(() => {
    const availableHeight = window.innerHeight - 80; 
    const availableWidth = window.innerWidth;
    const zoomW = (availableWidth / CANVAS_SIZE) * 0.9;
    const zoomH = (availableHeight / CANVAS_SIZE) * 0.9;
    setZoom(Math.min(1, Math.max(0.1, Math.min(zoomW, zoomH))));
  }, []);

  // 3. Update Minimap Indicator
  const updateMinimapIndicator = () => {
    if (!viewportRef.current) return;
    const viewW = viewportRef.current.clientWidth;
    const viewH = viewportRef.current.clientHeight;
    const scrollX = viewportRef.current.scrollLeft;
    const scrollY = viewportRef.current.scrollTop;
    const totalSize = CANVAS_SIZE * zoom;
    
    setViewBox({
      x: Math.min(100, Math.max(0, (scrollX / totalSize) * 100)),
      y: Math.min(100, Math.max(0, (scrollY / totalSize) * 100)),
      w: Math.min(100, (viewW / totalSize) * 100),
      h: Math.min(100, (viewH / totalSize) * 100)
    });
  };

  useEffect(() => { updateMinimapIndicator(); }, [zoom]);

  const fetchPixels = async () => {
    const { data } = await supabase.from('pixels').select('*');
    if (data) { setPixels(data); setPixelsSold(data.length); }
  };

  // 4. Dessin
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      pixels.forEach(p => { 
        ctx.fillStyle = p.color; ctx.fillRect(p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE); 
      });
      if (selectedBlock) {
        ctx.strokeStyle = "red"; ctx.lineWidth = 2;
        ctx.strokeRect(selectedBlock.x * BLOCK_SIZE, selectedBlock.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
      }
    }
    const mini = minimapRef.current;
    if (mini) {
        const ctxMini = mini.getContext('2d');
        ctxMini.fillStyle = "#FFFFFF"; ctxMini.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        pixels.forEach(p => { 
            ctxMini.fillStyle = p.color; ctxMini.fillRect(p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE); 
        });
    }
  }, [pixels, selectedBlock]);

  // Handlers
  const handleMinimapClick = (e) => {
    if (!viewportRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const ratioY = (e.clientY - rect.top) / rect.height;
    const totalSize = CANVAS_SIZE * zoom;
    viewportRef.current.scrollTo({
        left: (totalSize * ratioX) - (viewportRef.current.clientWidth / 2),
        top: (totalSize * ratioY) - (viewportRef.current.clientHeight / 2),
        behavior: 'smooth'
    });
  };

  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / zoom) / BLOCK_SIZE);
    const y = Math.floor(((e.clientY - rect.top) / zoom) / BLOCK_SIZE);
    if (x < 0 || x >= BLOCKS_PER_ROW || y < 0 || y >= BLOCKS_PER_ROW) return;

    const existing = pixels.find(p => p.x === x && p.y === y);
    setSelectedBlock({ x, y, status: existing ? 'occupied' : 'free', data: existing || null });
  };

  const handleBuySingle = async () => {
    if (!session) return alert("Please log in first.");
    const { error } = await supabase.from('pixels').insert({
      x: selectedBlock.x, y: selectedBlock.y, owner_id: session.user.id, color: '#000000', url: ''
    });
    if (error) alert("Error: " + error.message);
    else window.location.href = LINK_SINGLE;
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
    if (error) alert(error.message);
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setSignError('');
    if (signPass.length < 6) { setSignError("Password must be at least 6 characters"); return; }
    const { error } = await supabase.auth.signUp({ email: signEmail, password: signPass, options: { data: { pseudo } } });
    if (error) setSignError(error.message);
    else { alert("Account created! Check emails."); setShowSignUp(false); }
  };

  return (
    <div>
      {/* HEADER RESTAURÉ AVEC INPUTS */}
      <header>
        <div className="nav-left">The Pixel War</div>
        <div className="nav-center">{(10000 - pixelsSold).toLocaleString().replace(/,/g, ' ')} blocks left</div>
        <div className="nav-right">
          {!session ? (
            <>
              <input className="nav-input" placeholder="Email" onChange={e => setLoginEmail(e.target.value)} />
              <input className="nav-input" type="password" placeholder="Pass" onChange={e => setLoginPass(e.target.value)} />
              <button className="btn-login" onClick={handleLogin}>Login</button>
              <button className="btn-signup-nav" onClick={() => setShowSignUp(true)}>Sign Up</button>
            </>
          ) : (
            <div style={{display:'flex', alignItems:'center', gap:15}}>
                <span style={{fontSize:14, fontWeight:600}}>{session.user.email}</span>
                <button className="btn-login" onClick={() => supabase.auth.signOut()}>Logout</button>
            </div>
          )}
        </div>
      </header>

      <main>
        {/* MINI-MAP */}
        <div className="minimap-panel">
          <div className="minimap-preview" onClick={handleMinimapClick}>
            <canvas ref={minimapRef} width={CANVAS_SIZE} height={CANVAS_SIZE} style={{width:'100%', height:'100%', display:'block'}} />
            <div style={{
                position: 'absolute', border: '2px solid red', backgroundColor: 'rgba(255, 0, 0, 0.1)',
                top: `${viewBox.y}%`, left: `${viewBox.x}%`, width: `${viewBox.w}%`, height: `${viewBox.h}%`,
                pointerEvents: 'none', transition: 'all 0.1s linear'
            }}></div>
          </div>
          <p style={{fontSize:12, marginTop:10}}>Navigation</p>
        </div>

        {/* INFO PANEL */}
        <div className="info-panel">
          <h2 style={{marginTop:0, fontSize:22}}>Pixel Info</h2>
          {selectedBlock ? (
            <>
              <div style={{background:'#f3f4f6', padding:'15px', borderRadius:8, textAlign:'center', marginBottom:20}}>
                <div style={{fontSize:12, color:'#666', fontWeight:'bold'}}>Coordinates</div>
                <div style={{fontSize:24, fontWeight:'800', color:'#111'}}>X: {selectedBlock.x} | Y: {selectedBlock.y}</div>
              </div>
              <div style={{flex:1}}>
                {selectedBlock.status === 'occupied' ? (
                  <div>
                    <span style={{background:'#dcfce7', color:'#166534', padding:'4px 10px', borderRadius:50, fontSize:12, fontWeight:'bold'}}>Occupied</span>
                    <p><strong>Owner:</strong> {selectedBlock.data.owner_id ? 'Member' : 'Anon'}</p>
                    {selectedBlock.data.url && <a href={selectedBlock.data.url} target="_blank" rel="noreferrer">Visit Site</a>}
                  </div>
                ) : (
                  <div>
                    <span style={{background:'#dbeafe', color:'#1e40af', padding:'4px 10px', borderRadius:50, fontSize:12, fontWeight:'bold'}}>Free</span>
                    <p style={{color:'#666', marginTop:15}}>Available for purchase.</p>
                    <div style={{fontSize:18, fontWeight:'bold', marginTop:10}}>1.00$</div>
                  </div>
                )}
              </div>
              {selectedBlock.status === 'free' && (
                <button className="btn-login" style={{width:'100%'}} onClick={handleBuySingle}>Buy Block</button>
              )}
            </>
          ) : (
            <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#999'}}>Select a block</div>
          )}
        </div>

        {/* ZOOM */}
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}>-</button>
          <span style={{fontWeight:700, fontSize:14}}>Zoom: {Math.round(zoom * 100) / 100}x</span>
          <button className="zoom-btn" onClick={() => setZoom(Math.min(10, zoom + 0.1))}>+</button>
        </div>

        {/* GRILLE */}
        <div className="grid-viewport" ref={viewportRef} onScroll={updateMinimapIndicator}>
          <canvas 
            ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} onClick={handleCanvasClick}
            style={{ width: CANVAS_SIZE * zoom, height: CANVAS_SIZE * zoom, boxShadow: '0 0 50px rgba(0,0,0,0.1)', display: 'block', margin: 'auto' }}
          />
        </div>

        {/* MODALE SIGN UP RESTAURÉE */}
        {showSignUp && (
          <div className="modal-overlay" onClick={() => setShowSignUp(false)}>
            <div className="signup-card" onClick={e => e.stopPropagation()}>
              <h2>Create Account</h2>
              <form onSubmit={handleSignUpSubmit}>
                <input placeholder="Pseudo" required onChange={e => setPseudo(e.target.value)} />
                <input type="email" placeholder="Email" required onChange={e => setSignEmail(e.target.value)} />
                
                <div className="password-wrapper">
                  <input type={showPassword ? "text" : "password"} placeholder="Password" required onChange={e => setSignPass(e.target.value)} />
                  <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    )}
                  </button>
                </div>

                {signError && <div className="error-text" style={{color:'#dc2626', fontSize:14, marginBottom:10, fontWeight:600}}>{signError}</div>}
                
                <button type="submit" className="btn-signup-confirm">Sign Up</button>
                <button type="button" className="btn-cancel" onClick={() => setShowSignUp(false)}>Cancel</button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App