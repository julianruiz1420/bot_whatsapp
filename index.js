require('dotenv').config();
const express = require('express');
const qrcodeLib = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// 1. CONFIGURACIÓN DE SERVICIOS
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();
const port = process.env.PORT || 3000;

// INTERFAZ WEB CON BOTÓN (Panel de Control)
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Panel Control Bot</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
            </head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f4f4f9;">
                <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: inline-block;">
                    <h1 style="color: #25d366;">WhatsApp CRM Bot</h1>
                    <p>Estado del Servidor: <span style="color: green; font-weight: bold;">ONLINE</span></p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    
                    <button onclick="confirmarCierre()" 
                        style="background: #e74c3c; color: white; padding: 15px 30px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;">
                        LOGOUT (Cerrar Sesión)
                    </button>
                    
                    <p style="margin-top: 20px; color: #666; font-size: 14px;">
                        Nota: Al cerrar sesión, deberás revisar los Logs de Railway <br> para obtener el nuevo enlace del código QR.
                    </p>
                </div>

                <script>
                    function confirmarCierre() {
                        if (confirm('¿Estás seguro de que quieres cerrar la sesión del Bot?')) {
                            location.href = '/logout';
                        }
                    }
                </script>
            </body>
        </html>
    `);
});

// RUTA PARA CERRAR SESIÓN MANUALMENTE
app.get('/logout', async (req, res) => {
    try {
        console.log('⚠️ Petición de cierre de sesión recibida via Web/Comando...');
        await client.logout();
        await client.destroy();
        console.log('✅ Sesión destruida.');
        res.send('<h1>Sesión Cerrada</h1><p>El bot se está reiniciando. Por favor, revisa los Logs en Railway para ver el nuevo código QR.</p>');
        
        // Reinicio forzado para limpiar el volumen de Railway
        setTimeout(() => { process.exit(0); }, 3000);
    } catch (error) {
        console.error('❌ Error al cerrar sesión:', error.message);
        res.status(500).send('Error al intentar cerrar la sesión: ' + error.message);
    }
});

app.listen(port, '0.0.0.0', () => console.log(`[SERVER] Puerto ${port} listo.`));

// 2. INICIALIZACIÓN DEL CLIENTE
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'session',
        dataPath: path.join(__dirname, '.wwebjs_auth') 
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote']
    }
});

// 3. GESTIÓN DE QR
client.on('qr', async (qr) => {
    try {
        const qrBuffer = await qrcodeLib.toBuffer(qr, { type: 'png' });
        const fileName = `temp-qr/session-${Date.now()}.png`;
        
        await supabase.storage.from('qr-sessions').upload(fileName, qrBuffer, { 
            contentType: 'image/png', 
            upsert: true 
        });

        const { data } = supabase.storage.from('qr-sessions').getPublicUrl(fileName);
        console.log(`➡️ QR LINK: ${data.publicUrl}`);
    } catch (e) {
        console.error('❌ Error QR:', e.message);
    }
});

client.on('ready', () => console.log('✅ BOT CONECTADO.'));

// 4. LÓGICA DE MENSAJERÍA Y CRM
const CLASIFICACIONES_PERMITIDAS = ['!cliente nuevo', '!cliente recurrente'];

client.on('message_create', async (msg) => {
    if (msg.from.includes('@g.us') || msg.from.includes('broadcast')) return;

    const esSalida = msg.fromMe; 
    const chatId = esSalida ? msg.to : msg.from;
    const telefono = chatId.replace('@c.us', '');
    const mensajeTexto = msg.body ? msg.body.trim() : '';

    // COMANDO SECRETO DE CIERRE (Solo desde tu cuenta)
    if (esSalida && mensajeTexto.toLowerCase() === '!cerrar') {
        await msg.reply('⚠️ Cerrando sesión y reiniciando sistema...');
        await client.logout();
        await client.destroy();
        setTimeout(() => { process.exit(0); }, 2000);
        return;
    }

    try {
        let nombreDetectado = msg._data.notifyName || 'Contacto Nuevo';
        try {
            const chat = await msg.getChat();
            if (chat.name && chat.name !== telefono) {
                nombreDetectado = chat.name;
            }
        } catch (e) {}

        let { data: contacto } = await supabase
            .from('contactos')
            .select('nombre, clasificacion')
            .eq('telefono', telefono)
            .single();

        let clasificacionActual = contacto ? contacto.clasificacion : '!cliente nuevo';

        const comandos = ['!cliente recurrente', '!proveedor', '!cliente nuevo', '!grupo de gestion', '!operador'];
        
        if (esSalida && comandos.includes(mensajeTexto.toLowerCase())) {
            const nuevaClasificacion = mensajeTexto.toLowerCase();
            await supabase.from('contactos').upsert({ 
                telefono, 
                clasificacion: nuevaClasificacion, 
                nombre: nombreDetectado 
            }, { onConflict: 'telefono' });
            return; 
        }

        if (!contacto) {
            await supabase.from('contactos').insert([{ 
                telefono, 
                nombre: nombreDetectado, 
                clasificacion: '!cliente nuevo' 
            }]);
        }

        if (CLASIFICACIONES_PERMITIDAS.includes(clasificacionActual)) {
            await supabase.from('mensajes_whatsapp').insert([{ 
                telefono_origen: telefono, 
                mensaje_texto: mensajeTexto, 
                direccion: esSalida ? 'salida' : 'entrada' 
            }]);
        }
    } catch (error) {
        console.error("❌ Error en flujo:", error.message);
    }
});

client.initialize();