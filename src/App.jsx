import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// --- CONFIGURATION ---
// La grille fait 1000px de large visuellement, mais contient 100 blocs logiques
const CANVAS_SIZE = 1000; 
const BLOCKS_PER_ROW = 100; 
const BLOCK_SIZE = CANVAS_SIZE / BLOCKS_PER_ROW; // = 10px par bloc

// Liens Stripe (On affinera plus tard pour les promos)
const LINK_SINGLE = "https://buy.stripe.com/test_9B614mdAidvn44o6trb7y00"; 
const LINK_BATCH = "https://buy.stripe.com/test_eVqdR8fIq8b36cw197b7y01"; 

function App() {
  const canvasRef = useRef(null);
  
  // Données
  const [pixels, setPixels] = useState([]);
  const [session, setSession] = useState(null);
  const [pixelsSold, setPixelsSold] = useState(0);

  // État d'affichage
  const [zoom, setZoom] = useState(1);
  const [selectedBlock, setSelectedBlock] = useState(null); // Le bloc actuellement cliqué (x, y, infos)

  // États Header Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [showSignUp, setShowSignUp] = useState(false);
  
  // États Sign Up
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

  // 2. Zoom Auto au démarrage
  useEffect(() => {
    const availableHeight = window.innerHeight - 80; 
    const availableWidth = window.innerWidth;
    // On veut voir toute la grille (1000px) dans l'espace dispo
    const zoomW = (availableWidth / CANVAS_SIZE) * 0.9;
    const zoomH = (availableHeight / CANVAS_SIZE) * 0.9;
    setZoom(Math.min(1, Math.max(0.1, Math.min(zoomW, zoomH))));
  }, []);

  const fetchPixels = async () => {
    const { data } = await supabase.from('pixels').select('*');
    if (data) {
      setPixels(data);
      setPixelsSold(data.length);
    }
  };

  // 3. DESSIN DE LA GRILLE (Logique 100x100)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Fond blanc
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    // Pixels vendus
    pixels.forEach(p => { 
      ctx.fillStyle = p.color; 
      // Attention : p.x et p.y sont maintenant entre 0 et 99.
      // On multiplie par BLOCK_SIZE (10) pour dessiner sur le canvas 1000px
      ctx.fillRect(p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE); 
    });
    
    // Surbrillance du bloc sélectionné (Cadre Rouge)
    if (selectedBlock) {
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2; // Épaisseur du cadre
      ctx.strokeRect(selectedBlock.x * BLOCK_SIZE, selectedBlock.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    }

  }, [pixels, selectedBlock]);

  // --- ACTIONS ---

  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Calcul de la position dans le canvas (en pixels réels)
    const clickX = (e.clientX - rect.left) / zoom;
    const clickY = (e.clientY - rect.top) / zoom;
    
    // Conversion en coordonnées de bloc (0 à 99)
    const x = Math.floor(clickX / BLOCK_SIZE);
    const y = Math.floor(clickY / BLOCK_SIZE);

    // Sécurité hors limite
    if (x < 0 || x >= BLOCKS_PER_ROW || y < 0 || y >= BLOCKS_PER_ROW) return;

    // Vérifier si le bloc est occupé
    const existing = pixels.find(p => p.x === x && p.y === y);

    // Mise à jour du panneau de droite
    setSelectedBlock({
      x, 
      y, 
      status: existing ? 'occupied' : 'free',
      data: existing || null
    });
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
    if (error) alert(error.message);
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setSignError('');
    if (signPass.length < 6) { setSignError("Password min 6 chars"); return; }
    const { error } = await supabase.auth.signUp({
      email: signEmail, password: signPass,
      options: { data: { pseudo: pseudo } }
    });
    if (error) setSignError(error.message);
    else { alert("Account created!"); setShowSignUp(false); }
  };

  // ACHAT SIMPLE (Pour l'instant 1 par 1 pour tester la logique)
  const handleBuySingle = async () => {
    if (!session) return alert("Please log in first.");
    if (!selectedBlock) return;

    // On insère 1 bloc
    const { error } = await supabase.from('pixels').insert({
      x: selectedBlock.x,
      y: selectedBlock.y,
      owner_id: session.user.id,
      color: '#000000', // Noir par défaut pour l'instant
      url: ''
    });

    if (error) alert("Error: " + error.message);
    else {
      // Redirection Stripe (à adapter plus tard pour le panier)
      window.location.href = LINK_SINGLE;
    }
  };

  return (
    <div>
      {/* HEADER */}
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
        {/* 1. MINI-CARTE (GAUCHE) */}
        <div className="minimap-panel">
          <div className="minimap-preview">
            <div style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#999'}}>
              Mini Map (Step 3)
            </div>
          </div>
          <p style={{fontSize:12, textAlign:'center', marginTop:10}}>Navigation</p>
        </div>

        {/* 2. INFO PANEL (DROITE) - MAINTENANT DYNAMIQUE */}
        <div className="info-panel">
          <h2 style={{marginTop:0, fontSize:22}}>Pixel Info</h2>
          
          {selectedBlock ? (
            <>
              {/* COORDONNÉES */}
              <div style={{background:'#f3f4f6', padding:'15px', borderRadius:8, textAlign:'center', marginBottom:20}}>
                <div style={{fontSize:12, color:'#666', textTransform:'uppercase', fontWeight:'bold'}}>Coordinates</div>
                <div style={{fontSize:24, fontWeight:'800', color:'#111'}}>
                  X: {selectedBlock.x} <span style={{color:'#ccc'}}>|</span> Y: {selectedBlock.y}
                </div>
              </div>

              {/* CONTENU DYNAMIQUE */}
              <div style={{flex:1}}>
                {selectedBlock.status === 'occupied' ? (
                  <div>
                    <div style={{display:'inline-block', background:'#dcfce7', color:'#166534', padding:'4px 10px', borderRadius:50, fontSize:12, fontWeight:'bold', marginBottom:15}}>
                      Occupied
                    </div>
                    <p><strong>Owner:</strong> {selectedBlock.data.owner_id ? 'Member' : 'Anonymous'}</p>
                    {selectedBlock.data.url && (
                        <a href={selectedBlock.data.url} target="_blank" rel="noreferrer" style={{color:'#2563eb', textDecoration:'underline'}}>Visit Website</a>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{display:'inline-block', background:'#dbeafe', color:'#1e40af', padding:'4px 10px', borderRadius:50, fontSize:12, fontWeight:'bold', marginBottom:15}}>
                      Free Block
                    </div>
                    <p style={{color:'#666', fontSize:14}}>
                      This block is available. Purchase it to secure your spot on the grid forever.
                    </p>
                    <div style={{marginTop:20, fontSize:18, fontWeight:'bold'}}>
                      Price: 1.00$
                    </div>
                  </div>
                )}
              </div>

              {/* BOUTON D'ACTION */}
              {selectedBlock.status === 'free' && (
                <button className="btn-login" style={{width:'100%'}} onClick={handleBuySingle}>
                  Buy this Block
                </button>
              )}
            </>
          ) : (
            // SI RIEN N'EST SÉLECTIONNÉ
            <div style={{flex:1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', color:'#999'}}>
              <p>Select a block on the grid to see details.</p>
            </div>
          )}
        </div>

        {/* 3. ZOOM (BAS) */}
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}>-</button>
          <span style={{fontWeight:700, fontSize:14}}>Zoom: {Math.round(zoom * 100) / 100}x</span>
          <button className="zoom-btn" onClick={() => setZoom(Math.min(10, zoom + 0.1))}>+</button>
        </div>

        {/* 4. LA GRILLE (FOND) */}
        <div className="grid-viewport">
          <canvas 
            ref={canvasRef} 
            width={CANVAS_SIZE} 
            height={CANVAS_SIZE} 
            onClick={handleCanvasClick}
            style={{ 
              width: CANVAS_SIZE * zoom, 
              height: CANVAS_SIZE * zoom,
              boxShadow: '0 0 50px rgba(0,0,0,0.1)' 
            }}
          />
        </div>

        {/* MODALE SIGN UP */}
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
                    {/* SVG Oeil ici... (Je garde ton SVG existant pour faire court) */}
                    O
                  </button>
                </div>
                {signError && <div className="error-text">{signError}</div>}
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