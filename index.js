require('dotenv').config(); 

const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');

// --- ⚠️ CONFIGURACIÓN CRÍTICA: USANDO VARIABLES DE ENTORNO ⚠️ ---
// ESTOS VALORES DEBEN ESTAR CONFIGURADOS EN EL DASHBOARD DE RAILWAY
// NO SE DEBE HARDCODEAR INFORMACIÓN SENSIBLE EN EL CÓDIGO.

// 1. CREDENCIALES DE SUPABASE
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// 2. CREDENCIALES DE MONGODB
const MONGO_URI = process.env.MONGO_URI;

// 3. Verificación de variables (CRÍTICO para despliegue)
if (!SUPABASE_URL || !SUPABASE_KEY || !MONGO_URI) {
    console.error('\n❌ ERROR DE CONFIGURACIÓN ❌');
    console.error('Faltan variables de entorno CRÍTICAS (SUPABASE_URL, SUPABASE_KEY, MONGO_URI).');
    console.error('Por favor, configúralas en el dashboard de Railway antes de desplegar.');
    process.exit(1);
}

// =========================================================
// === 1. DIAGNÓSTICO DE SUPABASE ===
// =========================================================
console.log('🔍 Validando credenciales de Supabase...');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verificarConexionSupabase() {
    try {
        // La consulta de prueba verifica que la clave y la URL sean correctas
        const { data, error } = await supabase.from('mensajes_whatsapp').select('*').limit(1);

        if (error) {
            console.error('\n❌ ERROR DE CONEXIÓN A SUPABASE ❌');
            console.error(`Mensaje: ${error.message}`);
            
            if (error.code === 'PGRST301' || error.message.includes('JWT')) {
                console.error('👉 CAUSA: Tu API KEY es incorrecta o no tiene permisos (revisa RLS).');
            } else if (error.code === 'ENOTFOUND') {
                console.error('👉 CAUSA: La URL de Supabase está mal escrita.');
            }
        } else {
            console.log('✅ SUPABASE FUNCIONANDO CORRECTAMENTE.');
        }
    } catch (err) {
        console.error("Error crítico en Supabase:", err);
        // No salimos aquí, ya que el fallo puede ser temporal, pero avisamos.
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
                // Estos argumentos son CRÍTICOS para Railway para ahorrar RAM y Puppeteer
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
        
        // Función para obtener el texto o el tipo de mensaje para guardar
        const getMensajeTexto = (msg) => {
            if (msg.body && msg.body.length > 0) {
                // Si tiene cuerpo, es texto (o texto con media adjunta)
                return msg.body;
            }
            // Ignoramos mensajes de control o vacíos
            if (msg.type === 'chat') return null; 
            
            // Para multimedia (image, video, document, etc.)
            return `[${msg.type.toUpperCase()} COMPARTIDO]`;
        };

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
            // AÑADIDO: FILTRO PARA IGNORAR MENSAJES DE CONTROL/BROADCAST
            if (msg.from.includes('broadcast')) return; 

            // Filtrar grupos (como antes)
            if (msg.from.includes('@g.us')) return;

            const mensajeGuardar = getMensajeTexto(msg);
            
            // Ignorar mensajes de control y vacíos
            if (!mensajeGuardar) return; 

            const telefonoCliente = msg.from.replace('@c.us', '');

            if(supabase) {
                try {
                    // --- 1. REGISTRO DEL MENSAJE DE ENTRADA (INCOMING) ---
                    const { error: errorEntrada } = await supabase.from('mensajes_whatsapp').insert([{ 
                        telefono_origen: telefonoCliente, 
                        mensaje_texto: mensajeGuardar, 
                        created_at: new Date().toISOString(),
                        direccion: 'entrada' 
                    }]);
                    if (errorEntrada) console.error("❌ Error guardando entrada en Supabase:", errorEntrada.message);

                    
                    // --- 2. LÓGICA DE RESPUESTA DEL BOT (TEXTO Y MULTIMEDIA) ---
                    let respuestaDelBot = null;
                    let textoSalida = null;
                    
                    if (msg.body.toLowerCase().includes('hola')) {
                        respuestaDelBot = '¡Hola! Soy tu asistente virtual. ¿En qué te puedo servir hoy?';
                        await msg.reply(respuestaDelBot);
                        textoSalida = respuestaDelBot;
                        
                    } else if (msg.body.toLowerCase().includes('foto') || msg.body.toLowerCase().includes('imagen')) {
                        // 💡 EJEMPLO DE RESPUESTA CON MEDIA (requiere archivo local en /assets/foto_respuesta.jpg)
                        // const media = MessageMedia.fromFilePath('./assets/foto_respuesta.jpg');
                        // await client.sendMessage(msg.from, media);
                        
                        await msg.reply("Simulación: Imagen de nuestro catálogo enviada.");
                        textoSalida = '[IMAGEN DE SALIDA ENVIADA]';
                    }
                    
                    // --- 3. REGISTRO DEL MENSAJE DE SALIDA (OUTGOING) ---
                    if (textoSalida) {
                        const { error: errorSalida } = await supabase.from('mensajes_whatsapp').insert([{ 
                            telefono_origen: telefonoCliente, 
                            mensaje_texto: textoSalida, 
                            created_at: new Date().toISOString(),
                            direccion: 'salida' 
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