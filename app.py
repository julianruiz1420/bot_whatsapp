import os
import json
import psycopg2 
from flask import Flask, request, jsonify

app = Flask(__name__)

# Función para guardar datos en Supabase (PostgreSQL)
def guardar_mensaje_en_db(telefono, mensaje, tipo='text'):
    # Leer la URI de la base de datos de la variable de entorno de Heroku
    DATABASE_URL = os.environ.get('DATABASE_URL')

    if not DATABASE_URL:
        print("Error: DATABASE_URL no está configurada.")
        return

    conn = None
    cur = None
    try:
        # Conexión a PostgreSQL (Supabase)
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # Comando SQL para insertar el mensaje
        insert_query = """
        INSERT INTO mensajes_whatsapp (telefono_origen, mensaje_texto, tipo_mensaje)
        VALUES (%s, %s, %s);
        """
        cur.execute(insert_query, (telefono, mensaje, tipo))

        # Confirma la transacción
        conn.commit()
        print(f"Mensaje de {telefono} guardado con éxito.")

    except Exception as e:
        print(f"Error al guardar en la base de datos: {e}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# --------------------------------------------------------------------------
# 1. MÉTODO GET (VERIFICACIÓN DEL WEBHOOK DE META) - ¡ESTO FALTABA!
# --------------------------------------------------------------------------
@app.route("/webhook", methods=["GET"])
def verify():
    # Obtener el token de la variable de entorno de Heroku
    VERIFY_TOKEN = os.environ.get("VERIFY_TOKEN") 

    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    # Comprueba si se enviaron un modo y un token
    if mode and token:
        # Comprueba si el modo y el token son correctos
        if mode == "subscribe" and token == VERIFY_TOKEN:
            # Responde con el valor de 'challenge' para completar la verificación
            print("WEBHOOK_VERIFIED")
            return challenge, 200
        else:
            # Devuelve un error 403 si los tokens no coinciden
            print("ERROR: Verification token mismatch")
            return "Verification token mismatch", 403
    
    # Devuelve un error 400 si faltan parámetros
    return "Verification failed (missing parameters)", 400

# --------------------------------------------------------------------------
# 2. MÉTODO POST (RECEPCIÓN DE MENSAJES)
# --------------------------------------------------------------------------
@app.route("/webhook", methods=["POST"])
def webhook_post():
    data = request.get_json()
    print(f"Datos recibidos del Webhook: {data}") # Para depuración

    try:
        # Verifica si hay mensajes en la estructura JSON
        if data and 'entry' in data and data['entry'][0]['changes'][0]['value'].get('messages'):
            
            message_data = data['entry'][0]['changes'][0]['value']['messages'][0]
            
            # 1. Obtiene el número de teléfono del usuario
            telefono_origen = message_data['from']
            tipo_mensaje = message_data.get('type', 'unknown')

            # 2. Verifica el tipo de mensaje y extrae el texto
            if tipo_mensaje == 'text':
                texto_mensaje = message_data['text']['body']
            elif tipo_mensaje == 'button':
                texto_mensaje = message_data['button']['text']
            elif tipo_mensaje == 'list_reply':
                texto_mensaje = message_data['list_reply']['title']
            else:
                # Si no es texto, guarda solo el tipo (p.ej., 'image', 'sticker')
                texto_mensaje = f"[Mensaje de tipo {tipo_mensaje}]"
            
            # 3. Llama a la función para guardar en la base de datos
            guardar_mensaje_en_db(telefono_origen, texto_mensaje, tipo_mensaje)
            
    except Exception as e:
        # Esto captura errores si la estructura del JSON no es la esperada o si hay errores de BD
        print(f"Error al procesar el JSON de Meta: {e}")

    # Meta espera una respuesta 200 OK inmediatamente para no reintentar
    return "OK", 200

# --------------------------------------------------------------------------

if __name__ == "__main__":
    # Heroku usará gunicorn, pero esto es para prueba local
    app.run(debug=True)