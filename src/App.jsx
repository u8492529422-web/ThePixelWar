import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const ADMIN_EMAIL = "romain.silande@gmail.com";
const CANVAS_SIZE = 1000; 
const BLOCKS_PER_ROW = 100; 
const BLOCK_SIZE = CANVAS_SIZE / BLOCKS_PER_ROW; 

// LIENS STRIPE (Gardés en backup)
const LINK_TIER_1 = "https://buy.stripe.com/test_9B614mdAidvn44o6trb7y00";
const LINK_TIER_2 = "https://buy.stripe.com/test_6oU00i1RAcrj6cweZXb7y02";
const LINK_TIER_3 = "https://buy.stripe.com/test_cNi28q3ZI62VbwQ197b7y03";
const LINK_TIER_4 = "https://buy.stripe.com/test_bJe5kC0Nw1MF6cweZXb7y04";

function App() {
  // --- ÉTATS AJOUTÉS ---
  // Correction : Ce state doit être DANS la fonction, pas dehors
  const [isProcessing, setIsProcessing] = useState(false);
  
  // États pour les pages légales & About
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // États pour le changement de mot de passe
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const viewportRef = useRef(null);
  
  // CACHE IMAGES
  const imageCache = useRef({});
  const [imagesLoaded, setImagesLoaded] = useState(0);

  const [pixels, setPixels] = useState([]);
  const [session, setSession] = useState(null);
  const [pixelsSold, setPixelsSold] = useState(0);

  const [zoom, setZoom] = useState(1);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [isCentered, setIsCentered] = useState(false);

  // États Auth
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [showSignUp, setShowSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [signEmail, setSignEmail] = useState('');
  const [signPass, setSignPass] = useState('');
  const [signError, setSignError] = useState('');

  // États Achat & Sélection
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState([]);
  
  // Champs Formulaire Achat
  const [newColor, setNewColor] = useState('#000000');
  const [newLink, setNewLink] = useState('https://');
  const [newDescription, setNewDescription] = useState('');
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    fetchPixels();
  }, []);

  // 1. Zoom Auto
  useEffect(() => {
    const availableHeight = window.innerHeight - 80; 
    const availableWidth = window.innerWidth;
    const zoomW = (availableWidth / CANVAS_SIZE) * 0.65;
    const zoomH = (availableHeight / CANVAS_SIZE) * 0.65;
    setZoom(Math.min(1, Math.max(0.1, Math.min(zoomW, zoomH))));
  }, []);

  // 2. Centrage Initial
  useEffect(() => {
    if (viewportRef.current && !isCentered) {
        const v = viewportRef.current;
        v.scrollTop = (v.scrollHeight - v.clientHeight) / 2;
        v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2;
        setIsCentered(true);
    }
  }, [zoom]);

  // --- LOGIQUE PRIX ---
  const getPricePerBlock = (count) => {
    if (count >= 10) return 0.70;
    if (count >= 5) return 0.85;
    return 1.00;
  };

  const totalPrice = selectedBatch.length * getPricePerBlock(selectedBatch.length);
  const unitPrice = getPricePerBlock(selectedBatch.length);
  const discountPercent = unitPrice === 1 ? 0 : Math.round((1 - unitPrice) * 100);

  // --- MINIMAP INDICATOR ---
  const updateMinimapIndicator = () => {
    if (!viewportRef.current || !canvasRef.current) return;
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    
    const relativeX = viewport.scrollLeft - canvas.offsetLeft;
    const relativeY = viewport.scrollTop - canvas.offsetTop;
    const totalSize = CANVAS_SIZE * zoom;

    setViewBox({
      x: (relativeX / totalSize) * 100,
      y: (relativeY / totalSize) * 100,
      w: (viewport.clientWidth / totalSize) * 100,
      h: (viewport.clientHeight / totalSize) * 100
    });
  };

  useEffect(() => { updateMinimapIndicator(); }, [zoom]);

  const handleMinimapClick = (e) => {
    if (!viewportRef.current || !canvasRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const ratioY = (e.clientY - rect.top) / rect.height;
    
    const totalSize = CANVAS_SIZE * zoom;
    const canvasX = canvasRef.current.offsetLeft;
    const canvasY = canvasRef.current.offsetTop;

    viewportRef.current.scrollTo({
        left: canvasX + (totalSize * ratioX) - (viewportRef.current.clientWidth / 2),
        top: canvasY + (totalSize * ratioY) - (viewportRef.current.clientHeight / 2),
        behavior: 'smooth'
    });
  };

  // --- CHARGEMENT IMAGES (CACHE) ---
  useEffect(() => {
    pixels.forEach(p => {
      if (p.image_url && !imageCache.current[p.image_url]) {
        const img = new Image();
        img.src = p.image_url;
        img.onload = () => {
            imageCache.current[p.image_url] = img;
            setImagesLoaded(prev => prev + 1);
        };
      }
    });
  }, [pixels]);

  const fetchPixels = async () => {
    let query = supabase.from('pixels').select('*');
    // Si l'utilisateur n'est PAS l'admin, on filtre
    if (!session || session.user.email !== ADMIN_EMAIL) {
      query = query.eq('status', 'paid');
    }
    const { data, error } = await query;
    if (data) { 
      setPixels(data); 
      setPixelsSold(data.filter(p => p.status === 'paid').length); 
    }
    if (error) console.error("Erreur chargement:", error);
  };

  // --- DESSIN (AVEC DÉCOUPAGE D'IMAGE) ---
  const draw = (ctx, isMini = false) => {
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    pixels.forEach(p => { 
      if (p.status === 'pending') {
          if (isMini) {
             ctx.fillStyle = "red";
             ctx.fillRect(p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
             return;
          }
          ctx.fillStyle = "rgba(200, 200, 200, 0.8)"; 
          ctx.fillRect(p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          ctx.strokeStyle = "red";
          ctx.lineWidth = 1;
          ctx.strokeRect(p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          return; 
      }
      const img = p.image_url ? imageCache.current[p.image_url] : null;

      if (img) {
        const totalW = p.img_w || 1;
        const totalH = p.img_h || 1;
        const offsetX = p.img_ox || 0;
        const offsetY = p.img_oy || 0;
        const sourceW = img.width / totalW;
        const sourceH = img.height / totalH;
        const sourceX = offsetX * sourceW;
        const sourceY = offsetY * sourceH;

        ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
      } else {
        ctx.fillStyle = p.color || '#000'; 
        ctx.fillRect(p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE); 
      }
    });

    if (!isMini) {
        selectedBatch.forEach(block => {
            ctx.fillStyle = "rgba(37, 99, 235, 0.3)"; 
            ctx.fillRect(block.x * BLOCK_SIZE, block.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            ctx.strokeStyle = "#ff0000"; 
            ctx.lineWidth = 2;
            ctx.strokeRect(block.x * BLOCK_SIZE, block.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        });
    }
  };

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current.getContext('2d'), false);
    if (minimapRef.current) draw(minimapRef.current.getContext('2d'), true);
  }, [pixels, selectedBatch, imagesLoaded]);

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    const x = Math.floor(canvasX / BLOCK_SIZE);
    const y = Math.floor(canvasY / BLOCK_SIZE);

    if (x < 0 || x >= BLOCKS_PER_ROW || y < 0 || y >= BLOCKS_PER_ROW) return;

    const existing = pixels.find(p => p.x === x && p.y === y);
    if (existing) {
        if (!isMultiSelect) setSelectedBatch([{x, y, status: 'occupied', data: existing}]);
        return;
    }

    const isAlreadySelected = selectedBatch.find(b => b.x === x && b.y === y);
    if (isMultiSelect) {
        if (isAlreadySelected) setSelectedBatch(selectedBatch.filter(b => !(b.x === x && b.y === y)));
        else setSelectedBatch([...selectedBatch, {x, y, status: 'free'}]);
    } else {
        setSelectedBatch([{x, y, status: 'free'}]);
    }
  };

  // --- NOUVELLE FONCTION HANDLE BUY (Animation + Stripe Dynamique) ---
  const handleBuy = async (isAdminBypass = false) => {
    if (!session) return alert("Please log in first.");
    if (selectedBatch.length === 0) return;

    setIsProcessing(true); // START ANIMATION

    try {
        let publicImageUrl = null;
        if (imageFile) {
            const fileName = `${session.user.id}_${Date.now()}`;
            const { error } = await supabase.storage.from('pixel-images').upload(fileName, imageFile);
            if (error) throw new Error("Image upload failed: " + error.message);
            const { data } = supabase.storage.from('pixel-images').getPublicUrl(fileName);
            publicImageUrl = data.publicUrl;
        }

        const xs = selectedBatch.map(p => p.x);
        const ys = selectedBatch.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const groupWidth = Math.max(...xs) - minX + 1;
        const groupHeight = Math.max(...ys) - minY + 1;

        const pixelsToInsert = selectedBatch.map(p => ({
          x: p.x, y: p.y, owner_id: session.user.id, color: newColor, url: newLink, description: newDescription,
          image_url: publicImageUrl, pseudo: session.user.user_metadata?.pseudo || 'Anonymous',
          img_w: groupWidth, img_h: groupHeight, img_ox: p.x - minX, img_oy: p.y - minY,
          status: isAdminBypass ? 'paid' : 'pending' 
        }));

        const { error } = await supabase.from('pixels').insert(pixelsToInsert);
        if (error) throw error;

        if (isAdminBypass) {
            alert("✨ Magic Purchase Done!");
            fetchPixels(); setSelectedBatch([]); setImageFile(null); setNewDescription('');
            setIsProcessing(false); // STOP ANIMATION
            return;
        }
        
        const count = selectedBatch.length;
        console.log(`Lancement paiement pour ${count} pixels...`);
        
        const { data, error: fnError } = await supabase.functions.invoke('create-checkout', {
            body: { 
                count: count, 
                user_email: session.user.email,
                user_id: session.user.id
            },
        });

        if (fnError) throw fnError;

        if (data?.url) {
            window.location.href = data.url;
        } else {
            throw new Error("Pas d'URL Stripe reçue.");
        }

    } catch (err) {
        console.error("Erreur critique:", err);
        alert("Oups ! Une erreur est survenue : " + err.message);
        setIsProcessing(false); // STOP ANIMATION SI ERREUR
    }
  };

  // Auth Functions
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass });
    if (error) alert(error.message);
  };
  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    if (signPass.length < 6) { setSignError("Min 6 chars"); return; }
    const { error } = await supabase.auth.signUp({ email: signEmail, password: signPass, options: { data: { pseudo } } });
    if (error) setSignError(error.message); else { alert("Account created!"); setShowSignUp(false); }
  };

  // Change Password Function
  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return alert("Password must be at least 6 characters");
    
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    
    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("Password updated successfully! ✅");
      setShowChangePassword(false);
      setNewPassword('');
    }
  };

  return (
    <div>
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
          
          <div className="mode-toggle">
            <button className={`mode-btn ${!isMultiSelect ? 'active' : ''}`} onClick={() => {setIsMultiSelect(false); setSelectedBatch([])}}>Single</button>
            <button className={`mode-btn ${isMultiSelect ? 'active' : ''}`} onClick={() => {setIsMultiSelect(true); setSelectedBatch([])}}>Multi-Select</button>
          </div>

          {selectedBatch.length > 0 && selectedBatch[0] ? (
            <>
              {selectedBatch[0].status === 'occupied' && selectedBatch[0].data ? (
                 <div style={{display:'flex', flexDirection:'column', gap:12}}>
                    
                    {/* 1. IMAGE */}
                    {selectedBatch[0].data.image_url && (
                        <div style={{width:'100%', height:150, background:'#f3f4f6', borderRadius:8, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #e5e7eb'}}>
                            <img 
                                src={selectedBatch[0].data.image_url} 
                                style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}} 
                                alt="Pixel content" 
                            />
                        </div>
                    )}

                    {/* 2. HEADER */}
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <div style={{fontWeight:800, fontSize:18}}>
                            {selectedBatch[0].data.pseudo || 'Anonymous'}
                        </div>
                        <span style={{background:'#dcfce7', color:'#166534', fontSize:10, fontWeight:'bold', padding:'4px 8px', borderRadius:20, textTransform:'uppercase'}}>
                            Occupied
                        </span>
                    </div>

                    {/* 3. COORDONNÉES */}
                    <div style={{fontSize:12, color:'#6b7280', fontFamily:'monospace'}}>
                        Location: X:{selectedBatch[0].x} | Y:{selectedBatch[0].y}
                    </div>

                    {/* 4. DESCRIPTION */}
                    {selectedBatch[0].data.description && (
                        <div style={{background:'#f9fafb', border:'1px solid #e5e7eb', padding:12, borderRadius:8, fontSize:13, color:'#374151', fontStyle:'italic', lineHeight:1.4}}>
                            "{selectedBatch[0].data.description}"
                        </div>
                    )}

                    {/* 5. BOUTON LIEN */}
                    {selectedBatch[0].data.url && (
                        <a 
                            href={selectedBatch[0].data.url.startsWith('http') ? selectedBatch[0].data.url : `https://${selectedBatch[0].data.url}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn-login"
                            style={{
                                display:'flex', alignItems:'center', justifyContent:'center', 
                                textDecoration:'none', marginTop:5, background:'black'
                            }}
                        >
                            Visit Website ↗
                        </a>
                    )}
                 </div>
              ) : (
                 <div style={{flex:1, display:'flex', flexDirection:'column', overflowY:'auto'}}>
                    <div style={{fontSize:13, fontWeight:600, marginBottom:5}}>SETTINGS</div>
                    
                    <label style={{fontSize:12}}>Color</label>
                    <label className="btn-login btn-file-label" style={{backgroundColor: newColor, border: '1px solid #e5e7eb', color: newColor === '#ffffff' ? 'black' : 'white', marginBottom: 10}}>
                        {newColor}
                        <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{display:'none'}} />
                    </label>
                    
                    <label style={{fontSize:12}}>Upload Image (Optional)</label>
                    <label className="btn-login btn-file-label">
                        {imageFile ? "Image Selected ✓" : "Choose File"}
                        <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files[0])} />
                    </label>

                    <label style={{fontSize:12, fontWeight:'bold', color:'#444', marginTop:5}}>Link URL</label>
                    <input className="nav-input" style={{width:'100%', marginBottom:8, padding:'6px 10px'}} value={newLink} onChange={e => setNewLink(e.target.value)} />

                    <label style={{fontSize:12, fontWeight:'bold', color:'#444'}}>Description</label>
                    <textarea 
                        className="nav-input" 
                        style={{width:'100%', height:50, marginBottom:8, fontFamily:'inherit', padding:'6px 10px'}} 
                        value={newDescription} 
                        onChange={e => setNewDescription(e.target.value)} 
                        placeholder="Say something..."
                    />

                    <div className="price-summary">
                        <div className="price-row"><span>Blocks</span><span>{selectedBatch.length}</span></div>
                        <div className="price-row"><span>Unit</span><span>{unitPrice.toFixed(2)}$</span></div>
                        {discountPercent > 0 && (
                            <div className="price-row" style={{color:'#166534'}}><span>Discount</span><span className="discount-tag">-{discountPercent}%</span></div>
                        )}
                        <div className="price-total"><span>TOTAL</span><span>{totalPrice.toFixed(2)}$</span></div>
                    </div>

                    <button className="btn-login" style={{width:'100%', marginTop:15, padding:'15px'}} onClick={() => handleBuy(false)}>
                        Purchase Now
                    </button>

                    {session?.user?.email === ADMIN_EMAIL && (
                        <button style={{width: '100%', marginTop: 10, padding: '10px', background: 'linear-gradient(45deg, #FFD700, #FFA500)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer'}} onClick={() => handleBuy(true)}>
                            👑 Magic Add (Free)
                        </button>
                    )}
                 </div>
              )}
            </>
          ) : (
            <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#999', textAlign:'center'}}>
                <p>Select blocks on the grid.</p>
                {isMultiSelect && (
                    <p style={{fontSize: 15, fontWeight: '900', color: '#999', marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                        Multi-select Active !
                    </p>
                )}
            </div>
          )}
        </div>

        {/* ZOOM */}
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}>-</button>
          <span style={{fontWeight:700, fontSize:14}}>Zoom: {Math.round(zoom * 100) / 100}x</span>
          <button className="zoom-btn" onClick={() => setZoom(Math.min(10, zoom + 0.1))}>+</button>
        </div>

        {/* GRILLE */}
        <div 
            className="grid-viewport" 
            ref={viewportRef} 
            onScroll={updateMinimapIndicator}
        >
          <canvas 
            ref={canvasRef} 
            width={CANVAS_SIZE} 
            height={CANVAS_SIZE} 
            onClick={handleCanvasClick}
            style={{ 
                width: CANVAS_SIZE * zoom, 
                height: CANVAS_SIZE * zoom, 
                boxShadow: '0 0 50px rgba(0,0,0,0.1)', 
                display: 'block', 
                margin: 'auto' 
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
                  <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>O</button>
                </div>
                {signError && <div className="error-text">{signError}</div>}
                <button type="submit" className="btn-signup-confirm">Sign Up</button>
                <button type="button" className="btn-cancel" onClick={() => setShowSignUp(false)}>Cancel</button>
              </form>
            </div>
          </div>
        )}

        {/* --- LEFT FOOTER (About + Password) --- */}
        <div className="app-footer-left">
            <button className="footer-link" onClick={() => setShowAbout(true)}>
                ❤️ Why this project?
            </button>
            {session && (
              <button className="footer-link" onClick={() => setShowChangePassword(true)}>
                  🔐 Change Password
              </button>
            )}
        </div>

        {/* --- RIGHT FOOTER (Legal) --- */}
        <div className="app-footer">
            <button className="footer-link" onClick={() => setShowTerms(true)}>Terms of Service</button>
            <button className="footer-link" onClick={() => setShowPrivacy(true)}>Privacy Policy</button>
            <span className="footer-link" style={{cursor:'default'}}>© 2025 The Pixel War</span>
        </div>
      </main>

      {/* --- MODALE TERMS --- */}
      {showTerms && (
        <div className="modal-overlay" onClick={() => setShowTerms(false)}>
            <div className="legal-card" onClick={e => e.stopPropagation()}>
            <div className="legal-header">
                <h2>Terms of Service</h2>
                <span className="close-icon" onClick={() => setShowTerms(false)}>&times;</span>
            </div>
            <div className="legal-content">
                <h3>1. Ownership</h3>
                <p>When you buy pixels, you own the right to display an image and link on those coordinates. You do not own the website itself.</p>
                <h3>2. Content Policy</h3>
                <p>No hateful, illegal, or explicit content. We reserve the right to remove pixels without refund.</p>
                <h3>3. Refunds</h3>
                <p>All sales are final. Digital space cannot be returned.</p>
            </div>
            </div>
        </div>
      )}

      {/* --- MODALE PRIVACY --- */}
      {showPrivacy && (
        <div className="modal-overlay" onClick={() => setShowPrivacy(false)}>
            <div className="legal-card" onClick={e => e.stopPropagation()}>
            <div className="legal-header">
                <h2>Privacy Policy</h2>
                <span className="close-icon" onClick={() => setShowPrivacy(false)}>&times;</span>
            </div>
            <div className="legal-content">
                <h3>1. Data Collection</h3>
                <p>We only collect your email for login and payment confirmation.</p>
                <h3>2. Payments</h3>
                <p>Processed securely by Stripe. We do not store credit card info.</p>
                <h3>3. Contact</h3>
                <p>Contact us at thepixelwar.contact@gmail.com for any request.</p>
            </div>
            </div>
        </div>
      )}

      {/* --- MODALE ABOUT --- */}
      {showAbout && (
        <div className="modal-overlay" onClick={() => setShowAbout(false)}>
            <div className="legal-card" onClick={e => e.stopPropagation()}>
            <div className="legal-header">
                <h2>The Story Behind The Pixel War</h2>
                <span className="close-icon" onClick={() => setShowAbout(false)}>&times;</span>
            </div>
            <div className="legal-content">
                <p style={{fontStyle: 'italic', background: '#f3f4f6', padding: '15px', borderRadius: '8px', marginBottom: '20px'}}>
                  "One million pixels. One real student. One shot at building my future with code."
                </p>

                <h3>Who am I?</h3>
                <p>
                  My name is Romain. I’m 16 years old, a high school student, and a self-taught developer.<br/>
                  I built this website from scratch — not as a school project, but as a real one.
                  I love creating things on the internet, understanding how they work, and pushing ideas until they exist for real.
                </p>

                <h3>Why The Pixel War?</h3>
                <p>
                  I was inspired by the original Million Dollar Homepage, but I didn’t want to just copy an idea — I wanted to reinterpret it with my own skills and ambition.<br/>
                  The Pixel War is both a technical challenge and a personal one: designing, coding, securing, and launching a full platform alone, while studying.
                </p>
                <p>
                  Instead of taking on heavy student debt or working jobs that would slow down my learning, I chose a different path: building something valuable, public, and creative — and letting people decide if it’s worth supporting.
                </p>

                <h3>Where does the money go?</h3>
                <p>
                  Every pixel purchased directly supports my education and my growth as a developer and future engineer.<br/>
                  It helps fund:
                </p>
                <ul style={{paddingLeft: '20px', listStyleType: 'disc', marginBottom: '15px'}}>
                  <li>Advanced learning resources (programming, tech, entrepreneurship)</li>
                  <li>Better equipment to build more ambitious projects</li>
                  <li>Time — real time — to study, experiment, and improve</li>
                </ul>

                <p>
                  Think of it this way: buying pixels isn’t just advertising.<br/>
                  It’s turning a few pixels into hours of learning, building, and progress.
                </p>

                <h3>Be part of the story</h3>
                <p>
                  The Pixel War will stay online as a snapshot of everyone who believed in a young creator choosing work over shortcuts.<br/>
                  If you take a few pixels, you don’t just place an image — you leave a mark in my journey.
                </p>
                <p style={{fontWeight: 'bold', textAlign: 'center', marginTop: '20px', fontSize: '1.1em'}}>
                  Join the grid. Support a builder. Become part of the story.
                </p>

                <button className="btn-login" style={{width:'100%', marginTop:20, background:'black'}} onClick={() => setShowAbout(false)}>
                  Close & Buy a Pixel
                </button>
            </div>
            </div>
        </div>
      )}

      {/* --- MODALE CHANGE PASSWORD --- */}
      {showChangePassword && (
        <div className="modal-overlay" onClick={() => setShowChangePassword(false)}>
          <div className="signup-card" onClick={e => e.stopPropagation()}>
            <h2>Change Password</h2>
            <p style={{marginBottom: 20, color: '#666', fontSize: 14}}>Enter your new password below.</p>
            
            <form onSubmit={handleChangePasswordSubmit}>
              <div className="password-wrapper">
                <input 
                  type="password" 
                  placeholder="New Password" 
                  required 
                  minLength={6}
                  onChange={e => setNewPassword(e.target.value)} 
                />
              </div>
              
              <button type="submit" className="btn-signup-confirm">Update Password</button>
              <button type="button" className="btn-cancel" onClick={() => setShowChangePassword(false)}>Cancel</button>
            </form>
          </div>
        </div>
      )}

      {/* --- LOADING SCREEN (AVEC CROIX) --- */}
      {isProcessing && (
        <div className="loading-overlay">
          <div className="loading-close" onClick={() => setIsProcessing(false)} title="Cancel payment">
            &times;
          </div>
          
          <div className="pixel-spinner"></div>
          <div className="loading-text">Securing your blocks...</div>
          <div className="loading-subtext">Redirecting to secure payment</div>
        </div>
      )}
    </div>
  )
}

export default App