const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');

// --- ⚠️ CONFIGURACIÓN CRÍTICA ⚠️ ---

// 1. CREDENCIALES DE SUPABASE
const SUPABASE_URL = 'https://zgkgwgdaigrjprquvssc.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpna2d3Z2RhaWdyanBycXV2c3NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTg3MTYsImV4cCI6MjA3OTE3NDcxNn0.VzvP5wT-_PzO3lGNh1q08vwxN-l2pVlfHKzxGB2WkoQ'; 

// 2. CREDENCIALES DE MONGODB
const MONGO_URI = 'mongodb+srv://bot:gestion123456@cluster1.xx5zpla.mongodb.net/?appName=Cluster1';

// =========================================================
// === 1. DIAGNÓSTICO DE SUPABASE ===
// =========================================================
console.log('🔍 Validando credenciales de Supabase...');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verificarConexionSupabase() {
    try {
        const { data, error } = await supabase.from('mensajes_whatsapp').select('*').limit(1);

        if (error) {
            console.error('\n❌ ERROR DE CONEXIÓN A SUPABASE ❌');
            console.error(`Mensaje: ${error.message}`);
            
            if (error.code === 'PGRST301' || error.message.includes('JWT')) {
                console.error('👉 CAUSA: Tu API KEY es incorrecta.');
            } else if (error.code === 'ENOTFOUND') {
                console.error('👉 CAUSA: La URL de Supabase está mal escrita.');
            }
        } else {
            console.log('✅ SUPABASE FUNCIONANDO CORRECTAMENTE.');
        }
    } catch (err) {
        console.error("Error crítico en Supabase:", err);
    }
}
verificarConexionSupabase();


// =========================================================
// === 2. CONEXIÓN A MONGODB Y ARRANQUE ===
// =========================================================
console.log('⏳ Iniciando conexión a MongoDB...');

mongoose.set('debug', true); 

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('---------------------------------------------------');
        console.log('🎉 ¡CONEXIÓN A MONGODB EXITOSA! 🎉');
        console.log('---------------------------------------------------');
        
        const store = new MongoStore({ mongoose: mongoose });
        
        const client = new Client({
            authStrategy: new RemoteAuth({
                store: store,
                backupSyncIntervalMs: 60000,
                dataPath: './'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-extensions',
                    '--disable-gpu',
                    '--no-zygote',
                    '--no-first-run',
                    '--single-process',
                    '--disable-dev-shm-usage',
                    '--lang=en-US'
                ]
            }
        });

        client.on('qr', (qr) => {
            console.log('📱 ESCANEA ESTE QR:');
            qrcode.generate(qr, { small: true });
        });

        client.on('ready', () => {
            console.log('✅ BOT LISTO Y CONECTADO A WHATSAPP.');
        });

        client.on('remote_session_saved', () => {
            console.log('💾 Sesión guardada en MongoDB.');
        });

        client.on('message', async (msg) => {
            if (msg.from.includes('@g.us')) return;

            const telefonoCliente = msg.from.replace('@c.us', '');

            if(supabase) {
                try {
                    // --- 1. REGISTRO DEL MENSAJE DE ENTRADA (INCOMING) ---
                    const { error: errorEntrada } = await supabase.from('mensajes_whatsapp').insert([{ 
                        telefono_origen: telefonoCliente, 
                        mensaje_texto: msg.body,                         
                        created_at: new Date().toISOString(),
                        direccion: 'entrada' // 💡 NUEVO CAMPO
                    }]);
                    if (errorEntrada) console.error("❌ Error guardando entrada en Supabase:", errorEntrada.message);

                    
                    // --- 2. LÓGICA DE RESPUESTA DEL BOT (SI RESPONDE) ---
                    let respuestaDelBot = null;
                    
                    if (msg.body.toLowerCase().includes('hola')) {
                        respuestaDelBot = '¡Hola! Soy tu asistente virtual. ¿En qué te puedo servir hoy?';
                        await msg.reply(respuestaDelBot);
                    } else {
                        // Si tienes otra lógica de respuesta, ponla aquí.
                        // Solo respondemos si hay un 'hola' para el ejemplo.
                    }

                    // --- 3. REGISTRO DEL MENSAJE DE SALIDA (OUTGOING) ---
                    if (respuestaDelBot) {
                        const { error: errorSalida } = await supabase.from('mensajes_whatsapp').insert([{ 
                            telefono_origen: telefonoCliente,  // El cliente sigue siendo la referencia
                            mensaje_texto: respuestaDelBot,                         
                            created_at: new Date().toISOString(),
                            direccion: 'salida' // 💡 NUEVO CAMPO
                        }]);
                        if (errorSalida) console.error("❌ Error guardando salida en Supabase:", errorSalida.message);
                    }

                } catch (error) {
                    console.error("❌ Error fatal Supabase:", error);
                }
            }
        });

        console.log('🚀 Inicializando cliente de WhatsApp...');
        client.initialize();

    })
    .catch(err => {
        console.error('\n❌ ERROR CRÍTICO DE CONEXIÓN A MONGO ❌');
        console.error(`Razón: ${err.message}`);
        process.exit(1);
    });