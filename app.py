from flask import Flask, render_template, request, jsonify, session, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timezone
from functools import wraps
from datetime import datetime, timezone, timedelta
import os
import secrets


# ===== CONFIGURAÇÃO =====
app = Flask(__name__)
# Usar chave fixa em dev se não houver no ambiente para não deslogar a cada reload
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev_secret_key_123')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

def format_brazil_time(dt):
    brazil_tz = timezone(timedelta(hours=-3))
    return dt.astimezone(brazil_tz).strftime('%d/%m/%Y %H:%M')

# ===== DECORADORES DE SEGURANÇA =====
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Não autenticado'}), 401
        return f(*args, **kwargs)
    return decorated_function

def tech_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session or session.get('user_role') != 'tech':
            return jsonify({'success': False, 'message': 'Acesso negado: apenas técnicos'}), 403
        return f(*args, **kwargs)
    return decorated_function

# ===== MODELOS DO BANCO DE DADOS =====
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), default='client')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    owned_tickets = db.relationship(
        'Ticket',
        foreign_keys='Ticket.owner_id',
        backref='owner',
        lazy=True
    )

    assigned_tickets = db.relationship(
        'Ticket',
        foreign_keys='Ticket.tech_id',
        backref='tech',
        lazy=True
    )

    devices = db.relationship('Device', backref='owner', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Device(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    brand = db.Column(db.String(100), nullable=False)
    model = db.Column(db.String(100), nullable=False)
    serial = db.Column(db.String(100))
    type = db.Column(db.String(50), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    tickets = db.relationship('Ticket', backref='device', lazy=True)


class Ticket(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='aguardando')

    media_url = db.Column(db.String(255))

    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    tech_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    device_id = db.Column(db.Integer, db.ForeignKey('device.id'), nullable=False)

    support_id = db.Column(db.Integer, db.ForeignKey('technical_support.id'), nullable=False)
    support = db.relationship('TechnicalSupport', backref='tickets')

    history = db.relationship('TicketHistory', backref='ticket', lazy=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TicketHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, db.ForeignKey('ticket.id'), nullable=False)
    status = db.Column(db.String(20), nullable=False)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class TechnicalSupport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    phone = db.Column(db.String(20))
    email = db.Column(db.String(120))
    photo_url = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref='technical_support')

    def __init__(self, name, address, description, phone, email, photo_url, user_id):
        self.name = name
        self.address = address
        self.description = description
        self.phone = phone
        self.email = email
        self.photo_url = photo_url
        self.user_id = user_id


# ===== ROTAS DE PÁGINAS =====
@app.route('/')
def index():
    return render_template('index.html')


# ===== API DE AUTENTICAÇÃO =====
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email', '').lower().strip()

    if User.query.filter_by(email=email).first():
        return jsonify({'success': False, 'message': 'E-mail já cadastrado!'}), 400

    user = User(
        name=data.get('name', ''),
        email=email,
        role=data.get('role', 'client')
    )
    user.set_password(data.get('password', ''))

    db.session.add(user)
    db.session.commit()

    return jsonify({'success': True, 'message': 'Conta criada com sucesso!'}), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email', '').lower().strip()
    password = data.get('password', '')

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return jsonify({'success': False, 'message': 'Credenciais inválidas!'}), 401

    session['user_id'] = user.id
    session['user_email'] = user.email
    session['user_role'] = user.role

    return jsonify({
        'success': True,
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role
        }
    }), 200


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True}), 200


@app.route('/api/me', methods=['GET'])
@login_required
def get_current_user():
    user = db.session.get(User, session['user_id'])
    if not user:
        return jsonify({'success': False, 'message': 'Usuário não encontrado'}), 404

    return jsonify({
        'success': True,
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role
        }
    }), 200


# ===== API DE DISPOSITIVOS =====
@app.route('/api/devices', methods=['GET'])
@login_required
def get_devices():
    user = db.session.get(User, session['user_id'])

    if user.role == 'tech':
        devices = Device.query.all()
    else:
        devices = Device.query.filter_by(owner_id=user.id).all()

    return jsonify({
        'success': True,
        'devices': [{
            'id': d.id,
            'brand': d.brand,
            'model': d.model,
            'serial': d.serial,
            'type': d.type,
            'owner_id': d.owner_id,
            'owner_email': d.owner.email,
            'created_at': format_brazil_time(d.created_at)
        } for d in devices]
    }), 200


@app.route('/api/devices', methods=['POST'])
@login_required
def add_device():
    data = request.json
    user_id = session['user_id']

    device = Device(
        brand=data.get('brand', ''),
        model=data.get('model', ''),
        serial=data.get('serial', ''),
        type=data.get('type', ''),
        owner_id=user_id
    )

    db.session.add(device)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Dispositivo registrado!',
        'device': {
            'id': device.id,
            'brand': device.brand,
            'model': device.model,
            'serial': device.serial,
            'type': device.type,
            'created_at': format_brazil_time(device.created_at)
        }
    }), 201


# ===== API DE CHAMADOS (TICKETS) =====
@app.route('/api/tickets', methods=['GET'])
@login_required
def get_tickets():
    user = db.session.get(User, session['user_id'])

    # 👤 CLIENTE
    if user.role == 'client':
        tickets = Ticket.query.filter_by(owner_id=user.id).all()

    # 👨‍🔧 TÉCNICO
    else:
        support = TechnicalSupport.query.filter_by(user_id=user.id).first()

        if not support:
            tickets = []
        else:
            tickets = Ticket.query.filter_by(support_id=support.id).all()

    return jsonify({
        'success': True,
        'tickets': [{
            'id': t.id,
            'description': t.description,
            'status': t.status,
            'owner_id': t.owner_id,
            'owner_name': t.owner.name,
            'owner_email': t.owner.email,
            'tech_id': t.tech_id,
            'tech_name': t.tech.name if t.tech else None,
            'device_id': t.device_id,
            'device_brand': t.device.brand,
            'device_model': t.device.model,
            'device_type': t.device.type,
            'media_url': t.media_url,
            'created_at': format_brazil_time(t.created_at),
            'updated_at': format_brazil_time(t.updated_at),
            'history': [{
                'status': h.status,
                'note': h.note,
                'created_at': format_brazil_time(h.created_at)
            } for h in t.history]
        } for t in tickets]
    }), 200


@app.route('/api/tickets', methods=['POST'])
@login_required
def add_ticket():
    data = request.json
    user_id = session['user_id']
    
    media_url = data.get('media_url')
    support_id = data.get('support_id')

    if not support_id:
        return jsonify({'success': False, 'message': 'Selecione uma assistência'}), 400

    support = db.session.get(TechnicalSupport, support_id)
    if not support:
        return jsonify({'success': False, 'message': 'Assistência inválida'}), 400

    if not data.get('device_id'):
        return jsonify({'success': False, 'message': 'Selecione um dispositivo'}), 400

    ticket = Ticket(
        description=data.get('description', ''),
        device_id=data.get('device_id'),
        owner_id=user_id,
        support_id=support_id,
        status='aguardando',
        media_url=media_url
)

    history = TicketHistory(
        ticket=ticket,
        status='aguardando',
        note='Chamado aberto pelo cliente.'
    )

    db.session.add(ticket)
    db.session.add(history)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Chamado enviado para a assistência!',
    }), 201


@app.route('/api/tickets/<int:ticket_id>/assign', methods=['POST'])
@tech_required
def assign_ticket(ticket_id):
    user = db.session.get(User, session['user_id'])
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({'success': False, 'message': 'Chamado não encontrado'}), 404

    ticket.tech_id = user.id
    ticket.status = 'analise'

    history = TicketHistory(
        ticket=ticket,
        status='analise',
        note=f'Assumido por {user.name}.'
    )

    db.session.add(history)
    db.session.commit()

    return jsonify({'success': True, 'message': 'Chamado assumido!'}), 200


@app.route('/api/tickets/<int:ticket_id>/status', methods=['PUT'])
@tech_required
def update_ticket_status(ticket_id):
    data = request.json
    ticket = db.session.get(Ticket, ticket_id)

    if not ticket:
        return jsonify({'success': False, 'message': 'Chamado não encontrado'}), 404

    new_status = data.get('status', '')
    note = data.get('note', 'Status atualizado.')

    if new_status not in ['analise', 'reparo', 'finalizado']:
        return jsonify({'success': False, 'message': 'Status inválido'}), 400

    ticket.status = new_status

    history = TicketHistory(
        ticket=ticket,
        status=new_status,
        note=note
    )

    db.session.add(history)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Status atualizado!'}), 200

@app.route('/api/technical-support', methods=['GET'])
def get_technical_supports():
    supports = TechnicalSupport.query.all()
    return jsonify({
        'success': True,
        'supports': [{
            'id': s.id,
            'name': s.name,
            'address': s.address,
            'description': s.description,
            'phone': s.phone,
            'email': s.email,
            'photo_url': s.photo_url
        } for s in supports]
    }), 200

@app.route('/api/technical-support', methods=['POST'])
@tech_required
def add_technical_support():
    data = request.json
    support = TechnicalSupport(
        name=data.get('name', ''),
        address=data.get('address', ''),
        description=data.get('description', ''),
        phone=data.get('phone', ''),
        email=data.get('email', ''),
        photo_url=data.get('photo_url', ''),
        user_id=session['user_id']
    )

    db.session.add(support)
    db.session.commit()
    return jsonify({
        'success': True,
        'message': 'Assistência técnica cadastrada com sucesso!',
        'support': {
            'id': support.id,
            'name': support.name,
            'address': support.address,
            'description': support.description,
            'phone': support.phone,
            'email': support.email,
            'photo_url': support.photo_url
        }
    }), 201

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload', methods=['POST'])
@login_required
def upload_image():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'Nenhum arquivo enviado'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'Nome de arquivo vazio'}), 400

    if not allowed_file(file.filename):
        return jsonify({'success': False, 'message': 'Tipo de arquivo não permitido'}), 400

    filename = f"support_{session['user_id']}_{int(datetime.now(timezone.utc).timestamp())}.jpg"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    return jsonify({
        'success': True,
        'url': f'/uploads/{filename}'
    }), 200

@app.route('/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/technical-support/<int:support_id>', methods=['GET'])
def get_technical_support_detail(support_id):
    support = db.session.get(TechnicalSupport, support_id)
    if not support:
        return jsonify({'success': False, 'message': 'Assistência não encontrada'}), 404

    return jsonify({
        'success': True,
        'support': {
            'id': support.id,
            'name': support.name,
            'address': support.address,
            'description': support.description,
            'phone': support.phone,
            'email': support.email,
            'photo_url': support.photo_url
        }
    }), 200

# ===== INICIALIZAÇÃO =====
def create_initial_data():
    """Cria dados iniciais para teste"""
    with app.app_context():
        db.create_all()

        if not User.query.filter_by(email='tech@senac.br').first():
            tech = User(
                name='Técnico Admin',
                email='tech@senac.br',
                role='tech'
            )
            tech.set_password('123456')
            db.session.add(tech)

            client = User(
                name='Cliente Teste',
                email='cliente@senac.br',
                role='client'
            )
            client.set_password('123456')
            db.session.add(client)

            db.session.commit()
            print('✅ Usuários de teste criados!')
            print('   Técnico: tech@senac.br / 123456')
            print('   Cliente: cliente@senac.br / 123456')

if __name__ == '__main__':
    create_initial_data()
    print('🚀 Iniciando TechRepair Server...')
    print('📡 Acesse: http://localhost:5000')
    app.run(host="0.0.0.0", port=5000, debug=True)
