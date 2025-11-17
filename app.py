from flask import Flask, request, jsonify

app = Flask(__name__)

# REEMPLAZA ESTO con tu token secreto para Meta
VERIFY_TOKEN = 'Misecreto123' 

# --- Ruta para la Verificación (Método GET) ---
@app.route('/webhook', methods=['GET'])
def verify_webhook():
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    if mode == 'subscribe' and token == VERIFY_TOKEN:
        print("WEBHOOK_VERIFIED")
        return challenge, 200
    else:
        return jsonify({"error": "Verification failed"}), 403

# --- Ruta para Recibir Mensajes (Método POST) ---
@app.route('/webhook', methods=['POST'])
def handle_webhook():
    data = request.get_json()
    
    # Aquí irá la lógica de la Base de Datos más adelante
    print("Recibido el mensaje de WhatsApp:", data)
    
    return jsonify({"status": "ok"}), 200

if __name__ == '__main__':
    # Puerto 5000 es el estándar para desarrollo local
    app.run(debug=True, port=5000)