import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// --- CONFIGURATION ---
const GRID_SIZE = 1000;
const PIXEL_RENDER_SIZE = 1; // Changé à 1 pour faire du 1000x1000 réel

const STRIPE_LINK = "https://buy.stripe.com/test_9B614mdAidvn44o6trb7y00"; 

function App() {
  const canvasRef = useRef(null);
  const [pixels, setPixels] = useState([]);
  const [session, setSession] = useState(null);
  const [selectedPixel, setSelectedPixel] = useState(null);
  const [pixelsSold, setPixelsSold] = useState(0);
  const [zoom, setZoom] = useState(1); // Ajout du zoom

  // Formulaire
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newColor, setNewColor] = useState('#000000');
  const [newLink, setNewLink] = useState('https://');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchPixels();
  }, []);

  const fetchPixels = async () => {
    const { data, error } = await supabase.from('pixels').select('*');
    if (!error) {
      setPixels(data);
      setPixelsSold(data.length);
      drawGrid(data);
    }
  };

  const drawGrid = (pixelsData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);

    pixelsData.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 1, 1);
    });
  };

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calcul prenant en compte le zoom
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);

    const existingPixel = pixels.find(p => p.x === x && p.y === y);

    if (existingPixel) {
      if (existingPixel.url && !e.altKey) {
        window.open(existingPixel.url, '_blank');
      }
      setSelectedPixel({ ...existingPixel, status: 'owned' });
      if (session && existingPixel.owner_id === session.user.id) {
         setNewColor(existingPixel.color);
         setNewLink(existingPixel.url || '');
      }
    } else {
      setSelectedPixel({ x, y, status: 'free' });
    }
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Compte créé !");
  };

  const handlePreOrder = async () => {
    if (!session) return alert("Veuillez vous connecter ou créer un compte.");
    const { error } = await supabase.from('pixels').insert({
        x: selectedPixel.x,
        y: selectedPixel.y,
        owner_id: session.user.id,
        color: newColor,
        url: newLink
    });
    if (error) alert("Erreur ou pixel déjà pris : " + error.message);
    else window.location.href = STRIPE_LINK; 
  };

  const handleUpdate = async () => {
      const { error } = await supabase.from('pixels').update({
          color: newColor,
          url: newLink
      }).eq('id', selectedPixel.id);
      if (!error) {
          alert("Pixel mis à jour !");
          fetchPixels();
          setSelectedPixel(null);
      }
  };

  return (
    <div>
      <header>
        <div style={{display:'flex', alignItems:'center', gap: '15px'}}>
            <div style={{width: 30, height: 30, background: 'black'}}></div> 
            <h1>Million Pixel Grid</h1>
        </div>
        
        <div className="stats">
            {pixelsSold.toLocaleString()} pixels vendus / { (1000000 - pixelsSold).toLocaleString() } restants
        </div>

        <div>
            {!session ? (
              <div style={{display:'flex', gap: 10}}>
                <input style={{width: 150, margin:0}} placeholder="Email" onChange={e => setEmail(e.target.value)} />
                <input style={{width: 150, margin:0}} type="password" placeholder="Pass" onChange={e => setPassword(e.target.value)} />
                <button onClick={handleLogin}>Login</button>
                <button className="secondary" onClick={handleSignUp}>Sign Up</button>
              </div>
            ) : (
              <div style={{display:'flex', alignItems:'center', gap: 10}}>
                <span style={{fontSize: 14}}>Compte : {session.user.email}</span>
                <button className="secondary" onClick={() => supabase.auth.signOut()}>Logout</button>
              </div>
            )}
        </div>
      </header>

      <main>
        {/* Contrôles de zoom */}
        <div style={{margin: '10px 0'}}>
            <button onClick={() => setZoom(Math.max(1, zoom - 1))}>-</button>
            <span style={{margin: '0 15px'}}>Zoom: {zoom}x</span>
            <button onClick={() => setZoom(zoom + 1)}>+</button>
        </div>

        <div className="canvas-container" style={{overflow: 'auto', maxWidth: '100%', border: '1px solid #000'}}>
            <canvas 
                ref={canvasRef}
                width={GRID_SIZE}
                height={GRID_SIZE}
                onClick={handleCanvasClick}
                style={{ 
                    cursor: 'pointer', 
                    width: GRID_SIZE * zoom, 
                    height: GRID_SIZE * zoom,
                    imageRendering: 'pixelated' 
                }}
            />
        </div>

        {selectedPixel && (
            <>
            <div className="modal-overlay" onClick={() => setSelectedPixel(null)}></div>
            <div className="pixel-modal">
                <div style={{display:'flex', justifyContent:'space-between', marginBottom: 20}}>
                    <h3>Pixel Coords: {selectedPixel.x}, {selectedPixel.y}</h3>
                    <button className="secondary" onClick={() => setSelectedPixel(null)}>✕</button>
                </div>
                
                {selectedPixel.status === 'free' ? (
                    <div>
                        <p style={{color: '#666', marginBottom: 20}}>Ce pixel est disponible pour <strong>1.00 $</strong>.</p>
                        {session ? (
                            <>
                                <label>Choisissez une couleur</label>
                                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{height: 50, padding: 2}} />
                                <label>Lien de redirection (http://...)</label>
                                <input type="text" value={newLink} onChange={e => setNewLink(e.target.value)} placeholder="Votre site web" />
                                <button onClick={handlePreOrder} style={{width: '100%', padding: 15, fontSize: 16}}>💳 Payer et Réserver</button>
                            </>
                        ) : (
                            <p>Connectez-vous pour acheter ce pixel.</p>
                        )}
                    </div>
                ) : (
                    <div>
                        <p><strong>Propriétaire :</strong> Membre vérifié</p>
                        <a href={selectedPixel.url} target="_blank" style={{display:'block', padding: 10, background: '#f0f9ff', color: '#0284c7', borderRadius: 6, textAlign:'center'}}>Visiter le lien ➜</a>
                        {session && session.user.id === selectedPixel.owner_id && (
                            <div style={{marginTop: 20, borderTop: '1px solid #eee', paddingTop: 20}}>
                                <label>Modifier la couleur</label>
                                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} />
                                <label>Modifier le lien</label>
                                <input type="text" value={newLink} onChange={e => setNewLink(e.target.value)} />
                                <button onClick={handleUpdate}>Sauvegarder</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            </>
        )}
      </main>
    </div>
  )
}

export default App