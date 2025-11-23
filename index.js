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

// Esta función prueba la conexión inmediatamente
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
// === 2. CONEXIÓN A MONGODB Y ARRANQUE (CON SALIDA AUTOMÁTICA SI FALLA) ===
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
                    '--single-process', // ARGS DE OPTIMIZACIÓN CRUCIALES
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

            if(supabase) {
                try {
                    const { error } = await supabase.from('mensajes_whatsapp').insert([{ 
                        telefono_origen: msg.from.replace('@c.us', ''), 
                        mensaje_texto: msg.body,                         
                        created_at: new Date().toISOString()            
                    }]);
                    if (error) console.error("❌ Error guardando en Supabase:", error.message);
                } catch (error) {
                    console.error("❌ Error fatal Supabase:", error);
                }
            }
        });

        console.log('🚀 Inicializando cliente de WhatsApp...');
        client.initialize();

    })
    .catch(err => {
        // === AQUÍ ESTÁ EL CAMBIO PARA DETENER LA EJECUCIÓN ===
        console.error('\n❌ ERROR CRÍTICO DE CONEXIÓN A MONGO ❌');
        console.error(`Razón: ${err.message}`);
        
        if (err.message.includes('bad auth')) {
            console.error('👉 Solución: Contraseña o usuario incorrectos en MongoDB.');
        } else if (err.message.includes('SSL')) {
            console.error('👉 Solución: La dirección del Cluster es incorrecta (copia mal la URL).');
        }

        console.error('\n🛑 DETENIENDO EJECUCIÓN DEL PROGRAMA...');
        process.exit(1); // <--- ESTO CIERRA LA APLICACIÓN INMEDIATAMENTE
    });