import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const ADMIN_EMAIL = "romain.silande@gmail.com";
const CANVAS_SIZE = 1000; 
const BLOCKS_PER_ROW = 100; 
const BLOCK_SIZE = CANVAS_SIZE / BLOCKS_PER_ROW; 

// LIENS STRIPE
const LINK_TIER_1 = "https://buy.stripe.com/test_9B614mdAidvn44o6trb7y00";
const LINK_TIER_2 = "https://buy.stripe.com/test_6oU00i1RAcrj6cweZXb7y02";
const LINK_TIER_3 = "https://buy.stripe.com/test_cNi28q3ZI62VbwQ197b7y03";
const LINK_TIER_4 = "https://buy.stripe.com/test_bJe5kC0Nw1MF6cweZXb7y04";

function App() {
  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const viewportRef = useRef(null);
  
  // CACHE IMAGES (C'était sûrement ça qui manquait)
  const imageCache = useRef({});
  const [imagesLoaded, setImagesLoaded] = useState(0);

  const [pixels, setPixels] = useState([]);
  const [session, setSession] = useState(null);
  const [pixelsSold, setPixelsSold] = useState(0);

  const [zoom, setZoom] = useState(1);
  const [selectedBlock, setSelectedBlock] = useState(null);
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
    // Si c'est toi l'admin, tu veux tout voir (pour valider les commandes)
    // Sinon, on ne montre que ce qui est payé ('paid')
    let query = supabase.from('pixels').select('*');
    
    // Si l'utilisateur n'est PAS l'admin (ou pas connecté), on filtre
    if (!session || session.user.email !== ADMIN_EMAIL) {
      query = query.eq('status', 'paid');
    }

    const { data, error } = await query;
    
    if (data) { 
      setPixels(data); 
      // Pour le compteur, on ne compte que les payés
      setPixelsSold(data.filter(p => p.status === 'paid').length); 
    }
    if (error) console.error("Erreur chargement:", error);
  };

  // --- DESSIN (AVEC DÉCOUPAGE D'IMAGE) ---
  const draw = (ctx, isMini = false) => {
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    pixels.forEach(p => { 
      
      if (p.status === 'pending') {
          // Si c'est la minimap, on les affiche en rouge pour les repérer vite
          if (isMini) {
             ctx.fillStyle = "red";
             ctx.fillRect(p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
             return;
          }

          // Sur la grille principale : Hachures ou gris semi-transparent
          ctx.fillStyle = "rgba(200, 200, 200, 0.8)"; // Gris clair
          ctx.fillRect(p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          
          // Une croix rouge ou bordure pour dire "Pas encore validé"
          ctx.strokeStyle = "red";
          ctx.lineWidth = 1;
          ctx.strokeRect(p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          return; // IMPORTANT : On arrête là pour ce pixel, on ne dessine pas l'image par dessus
      }
      const img = p.image_url ? imageCache.current[p.image_url] : null;

      if (img) {
        // Logique de découpage (Slicing)
        // Si ces valeurs n'existent pas (vieux pixels), on met des valeurs par défaut
        const totalW = p.img_w || 1;
        const totalH = p.img_h || 1;
        const offsetX = p.img_ox || 0;
        const offsetY = p.img_oy || 0;

        // Calcul de la portion de l'image source à prendre
        const sourceW = img.width / totalW;
        const sourceH = img.height / totalH;
        const sourceX = offsetX * sourceW;
        const sourceY = offsetY * sourceH;

        // drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        ctx.drawImage(
            img, 
            sourceX, sourceY, sourceW, sourceH, // Quoi prendre dans l'image source
            p.x * BLOCK_SIZE, p.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE // Où le mettre sur la grille
        );
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

  // --- ACHAT AVEC CALCUL DE L'IMAGE ÉTENDUE ---
  const handleBuy = async (isAdminBypass = false) => {
    if (!session) return alert("Please log in first.");
    if (selectedBatch.length === 0) return;

    let publicImageUrl = null;
    
    // 1. Upload Image
    if (imageFile) {
        const fileName = `${session.user.id}_${Date.now()}`;
        const { error } = await supabase.storage.from('pixel-images').upload(fileName, imageFile);
        if (error) return alert("Image upload failed: " + error.message);
        const { data } = supabase.storage.from('pixel-images').getPublicUrl(fileName);
        publicImageUrl = data.publicUrl;
    }

    // 2. CALCUL DU PUZZLE (Bounding Box)
    // On cherche les limites min et max de la sélection pour connaître la taille du rectangle
    const xs = selectedBatch.map(p => p.x);
    const ys = selectedBatch.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    // Largeur et Hauteur totale du groupe en nombre de blocs
    const groupWidth = maxX - minX + 1;
    const groupHeight = maxY - minY + 1;

    // 3. Préparation des données
    const pixelsToInsert = selectedBatch.map(p => ({
      x: p.x, 
      y: p.y, 
      owner_id: session.user.id, 
      color: newColor, 
      url: newLink,
      description: newDescription,
      image_url: publicImageUrl,
      // Infos pour le découpage d'image
      img_w: groupWidth,
      img_h: groupHeight,
      img_ox: p.x - minX,
      img_oy: p.y - minY,
      status: isAdminBypass ? 'paid' : 'pending' 
    }));

    const { error } = await supabase.from('pixels').insert(pixelsToInsert);
    
    if (error) alert("Error: " + error.message);
    else {
        if (isAdminBypass) {
            alert("✨ Magic Purchase: Pixels added for FREE!");
            fetchPixels(); setSelectedBatch([]); setImageFile(null); setNewDescription('');
            return;
        }
        
        const count = selectedBatch.length;
        let finalLink = LINK_TIER_1;
        if (count >= 10) finalLink = LINK_TIER_4; 
        else if (count >= 5) finalLink = LINK_TIER_3; 
        
        window.location.href = finalLink; 
    }
  };

  // Auth
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
                 <div>
                    <div style={{background:'#dcfce7', color:'#166534', padding:'10px', borderRadius:6, marginBottom:10, fontWeight:'bold', textAlign:'center'}}>Block Occupied</div>
                    <p style={{fontSize:14}}><strong>X:</strong> {selectedBatch[0].x} | <strong>Y:</strong> {selectedBatch[0].y}</p>
                    <p style={{fontSize:14}}><strong>By:</strong> {selectedBatch[0].data?.owner_id || 'Unknown'}</p>
                    {selectedBatch[0].data?.description && (
                        <p style={{fontSize:13, fontStyle:'italic', color:'#555', background:'#f1f5f9', padding:8, borderRadius:4}}>
                            "{selectedBatch[0].data.description}"
                        </p>
                    )}
                 </div>
              ) : (
                 <div style={{flex:1, display:'flex', flexDirection:'column', 
                 overflowY:'auto'}}>
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

                    <label style={{fontSize:12, marginTop:5}}>Link URL</label>
                    <input className="nav-input" style={{width:'100%', marginBottom:10}} value={newLink} onChange={e => setNewLink(e.target.value)} />

                    <label style={{fontSize:12}}>Description</label>
                    <textarea 
                        className="nav-input" 
                        style={{width:'100%', height:60, marginBottom:10, fontFamily:'inherit'}} 
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
      </main>
    </div>
  )
}

export default App