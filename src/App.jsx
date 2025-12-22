import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// --- CONFIGURATION ---
const GRID_SIZE = 1000;
const LINK_SINGLE = "https://buy.stripe.com/test_9B614mdAidvn44o6trb7y00"; 
const LINK_BATCH = "https://buy.stripe.com/test_eVqdR8fIq8b36cw197b7y01"; 

function App() {
  const canvasRef = useRef(null);
  const [pixels, setPixels] = useState([]);
  const [session, setSession] = useState(null);
  const [zoom, setZoom] = useState(1);
  
  // États Header (Login)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // États Sign Up Modal
  const [showSignUp, setShowSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false); // L'oeil du mot de passe
  const [pseudo, setPseudo] = useState('');
  const [signEmail, setSignEmail] = useState('');
  const [signPass, setSignPass] = useState('');
  const [signError, setSignError] = useState('');

  // États Grille & Achat
  const [selectedBatch, setSelectedBatch] = useState([]); 
  const [isSelectingBatch, setIsSelectingBatch] = useState(false);
  const [showPixelModal, setShowPixelModal] = useState(false);
  const [newColor, setNewColor] = useState('#000000');
  const [newLink, setNewLink] = useState('https://');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    fetchPixels();
  }, []);

  const fetchPixels = async () => {
    try {
        const { data, error } = await supabase.from('pixels').select('*');
        if (error) throw error;
        if (data) setPixels(data);
    } catch (err) {
        console.error("Error fetching pixels:", err.message);
    }
  };

  // --- DESSIN DE LA GRILLE ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
    
    pixels.forEach(p => { 
      ctx.fillStyle = p.color; 
      ctx.fillRect(p.x, p.y, 1, 1); 
    });
    
    ctx.fillStyle = "#2563eb"; // Couleur de sélection bleue
    selectedBatch.forEach(p => { ctx.fillRect(p.x, p.y, 1, 1); });
  }, [pixels, selectedBatch, zoom]);

  // --- LOGIQUE DE CLIC ---
  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);

    const existing = pixels.find(p => p.x === x && p.y === y);
    if (existing) {
      if (!isSelectingBatch) window.open(existing.url, '_blank');
      return;
    }

    if (isSelectingBatch) {
      if (selectedBatch.find(p => p.x === x && p.y === y)) {
        const next = selectedBatch.filter(p => !(p.x === x && p.y === y));
        setSelectedBatch(next);
      } else if (selectedBatch.length < 10) {
        setSelectedBatch([...selectedBatch, { x, y }]);
      }
    } else {
      setSelectedBatch([{ x, y }]);
      setShowPixelModal(true);
    }
  };

  // --- ACTIONS AUTH ---
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
    if (error) alert("Login error: " + error.message);
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setSignError('');
    if (signPass.length < 6) {
      setSignError("Password must be at least 6 characters");
      return;
    }
    const { error } = await supabase.auth.signUp({
      email: signEmail, password: signPass,
      options: { data: { pseudo: pseudo } }
    });
    if (error) setSignError(error.message);
    else { 
        alert("Account created! Please check your email to confirm."); 
        setShowSignUp(false); 
    }
  };

  const handleBuy = async () => {
    if (!session) return alert("Please log in first.");
    const pixelsToInsert = selectedBatch.map(p => ({
      x: p.x, y: p.y, owner_id: session.user.id, color: newColor, url: newLink
    }));
    const { error } = await supabase.from('pixels').insert(pixelsToInsert);
    if (error) alert("Purchase error: " + error.message);
    else window.location.href = selectedBatch.length === 10 ? LINK_BATCH : LINK_SINGLE;
  };

  return (
    <div>
      {/* HEADER EXACT À L'IMAGE */}
      <header>
        <div className="nav-left">The Pixel War</div>
        
        <div className="nav-center">
          {(1000000 - pixels.length).toLocaleString().replace(/,/g, ' ')} pixels left
        </div>

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
        {/* INDICATEUR PACK 10 */}
        {isSelectingBatch && (
          <div style={{position:'fixed', top:100, background:'#000', color:'#fff', padding:'10px 20px', borderRadius:8, zIndex:200}}>
            Selection: {selectedBatch.length} / 10 | 
            <button onClick={() => {setIsSelectingBatch(false); setShowPixelModal(true)}} style={{marginLeft:10, cursor:'pointer'}}>Confirm</button>
          </div>
        )}

        <div className="canvas-container">
          <canvas 
            ref={canvasRef} width={GRID_SIZE} height={GRID_SIZE} 
            onClick={handleCanvasClick}
            style={{ width: GRID_SIZE * zoom, height: GRID_SIZE * zoom }}
          />
        </div>

        {/* ZOOM FLOTTANT */}
        <div className="floating-controls">
          <button onClick={() => setZoom(Math.max(1, zoom - 1))}>-</button>
          <span style={{fontWeight:700}}>Zoom: {zoom}x</span>
          <button onClick={() => setZoom(Math.min(20, zoom + 1))}>+</button>
        </div>

        {/* MODALE SIGN UP (IMAGE MATCH + OEIL) */}
        {showSignUp && (
          <div className="modal-overlay" onClick={() => setShowSignUp(false)}>
            <div className="signup-card" onClick={e => e.stopPropagation()}>
              <h2>Create Account</h2>
              <form onSubmit={handleSignUpSubmit}>
                <input placeholder="Pseudo" required onChange={e => setPseudo(e.target.value)} />
                <input type="email" placeholder="Email" required onChange={e => setSignEmail(e.target.value)} />
                
                {/* CHAMP PASSWORD AVEC OEIL */}
                <div className="password-wrapper">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Password" 
                    required 
                    onChange={e => setSignPass(e.target.value)} 
                  />
                  <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    )}
                  </button>
                </div>

                {signError && <div className="error-text" style={{color:'red', fontSize:14, marginBottom:10}}>{signError}</div>}
                
                <button type="submit" className="btn-signup-confirm">Sign Up</button>
                <button type="button" className="btn-cancel" onClick={() => setShowSignUp(false)}>Cancel</button>
              </form>
            </div>
          </div>
        )}

        {/* MODALE ACHAT PIXEL */}
        {showPixelModal && (
          <div className="modal-overlay" onClick={() => setShowPixelModal(false)}>
            <div className="signup-card" onClick={e => e.stopPropagation()}>
              <h2>{selectedBatch.length === 10 ? "Pack 10 Pixels" : "Buy Pixel"}</h2>
              <label style={{fontSize:12, fontWeight:700}}>COLOR</label>
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{height:50, padding:5, marginBottom:15}} />
              <label style={{fontSize:12, fontWeight:700}}>LINK (URL)</label>
              <input placeholder="https://your-site.com" value={newLink} onChange={e => setNewLink(e.target.value)} />
              
              <button className="btn-signup-confirm" onClick={handleBuy}>
                Pay {selectedBatch.length === 10 ? "6.50$" : "1.00$"}
              </button>
              
              {selectedBatch.length === 1 && (
                <button className="btn-cancel" style={{color:'#2563eb'}} onClick={() => {setShowPixelModal(false); setIsSelectingBatch(true);}}>
                    🚀 Get 10 pixels for 6.50$
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App