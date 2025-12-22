import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// CONFIGURATION
const GRID_SIZE = 1000; // 1000x1000 pixels
const PIXEL_RENDER_SIZE = 10; // Zoom visuel

function App() {
  const canvasRef = useRef(null);
  const [pixels, setPixels] = useState([]);
  const [session, setSession] = useState(null);
  const [selectedPixel, setSelectedPixel] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // États formulaire
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newColor, setNewColor] = useState('#ff0000');
  const [newLink, setNewLink] = useState('https://');

  // 1. Gestion Authentification
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Chargement des Pixels
  useEffect(() => {
    fetchPixels();
  }, []);

  const fetchPixels = async () => {
    const { data, error } = await supabase.from('pixels').select('*');
    if (!error) {
      setPixels(data);
      drawGrid(data);
    }
    setLoading(false);
  };

  // 3. Dessiner la Grille
  const drawGrid = (pixelsData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Fond blanc
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, GRID_SIZE * PIXEL_RENDER_SIZE, GRID_SIZE * PIXEL_RENDER_SIZE);

    // Pixels
    pixelsData.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * PIXEL_RENDER_SIZE, p.y * PIXEL_RENDER_SIZE, PIXEL_RENDER_SIZE, PIXEL_RENDER_SIZE);
    });
  };

  // 4. Clic sur la Grille
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / PIXEL_RENDER_SIZE);
    const y = Math.floor((e.clientY - rect.top) / PIXEL_RENDER_SIZE);

    const existingPixel = pixels.find(p => p.x === x && p.y === y);

    if (existingPixel) {
      // Si on clique normalement, on ouvre le lien
      if (existingPixel.url && !e.altKey) { 
         window.open(existingPixel.url, '_blank');
      }
      setSelectedPixel({ ...existingPixel, status: 'owned' });
      // Si c'est le proprio, on préremplit pour éditer
      if (session && existingPixel.owner_id === session.user.id) {
         setNewColor(existingPixel.color);
         setNewLink(existingPixel.url || '');
      }
    } else {
      setSelectedPixel({ x, y, status: 'free' });
    }
  };

  // 5. Actions
  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert("Vérifiez vos emails !");
    else alert("Compte créé ! Connectez-vous.");
  };

  const handleLogout = () => supabase.auth.signOut();

  // Achat (Simulation pour l'instant)
  const handleBuy = async () => {
    if (!session) return alert("Connectez-vous d'abord !");
    
    // ICI : Normalement on redirige vers Stripe
    const confirm = window.confirm("Simulation de paiement Stripe : Cliquez OK pour valider l'achat.");
    
    if (confirm) {
        const { error } = await supabase.from('pixels').insert({
            x: selectedPixel.x,
            y: selectedPixel.y,
            owner_id: session.user.id,
            color: newColor,
            url: newLink
        });
        if (error) alert(error.message);
        else fetchPixels();
    }
  };

  return (
    <div>
      <header>
        <h1>The Million Pixel Grid</h1>
        {!session ? (
          <div className="auth-form">
            <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
            <input type="password" placeholder="Mot de passe" onChange={e => setPassword(e.target.value)} />
            <button onClick={handleLogin}>Login</button>
            <button onClick={handleSignUp}>Sign Up</button>
          </div>
        ) : (
          <div>
            <span>Compte : {session.user.email} </span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        )}
      </header>

      <main>
        <div className="canvas-container" style={{ maxWidth: '100%', overflow: 'auto' }}>
            <canvas 
                ref={canvasRef}
                width={GRID_SIZE * PIXEL_RENDER_SIZE}
                height={GRID_SIZE * PIXEL_RENDER_SIZE}
                onClick={handleCanvasClick}
                style={{ cursor: 'pointer' }}
            />
        </div>

        {selectedPixel && (
            <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'white', padding: 20, border: '2px solid black', borderRadius: 10, textAlign:'left' }}>
                <h3>Pixel [{selectedPixel.x}, {selectedPixel.y}]</h3>
                
                {selectedPixel.status === 'free' ? (
                    <div>
                        <p>Libre !</p>
                        {session ? (
                            <>
                                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} /> <br/>
                                <input type="text" placeholder="https://..." value={newLink} onChange={e => setNewLink(e.target.value)} /> <br/>
                                <button onClick={handleBuy}>Acheter ce Pixel</button>
                            </>
                        ) : (
                            <p>Connectez-vous pour acheter.</p>
                        )}
                    </div>
                ) : (
                    <div>
                        <p>Appartient à quelqu'un.</p>
                        <p>Lien : <a href={selectedPixel.url} target="_blank">{selectedPixel.url}</a></p>
                    </div>
                )}
            </div>
        )}
      </main>
    </div>
  )
}

export default App