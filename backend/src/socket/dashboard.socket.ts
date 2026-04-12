import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { AdminJwtPayload } from '../types';

let io: SocketServer | null = null;

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (config.nodeEnv !== 'production') return true;

  const allowedOrigins = new Set(
    (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean)
  );

  return (
    allowedOrigins.has(origin) ||
    origin === 'http://localhost' ||
    origin === 'https://localhost' ||
    origin === 'capacitor://localhost' ||
    origin === 'http://127.0.0.1' ||
    origin === 'https://127.0.0.1'
  );
}

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        const allowed = isAllowedOrigin(origin);
        callback(allowed ? null : new Error(`CORS blocked origin: ${origin}`), allowed);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authenticate all socket connections using the same JWT as the REST API
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    try {
      const payload = jwt.verify(token, config.jwt.secret) as AdminJwtPayload;
      socket.data.admin = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const admin = socket.data.admin as AdminJwtPayload;

    // Admins/super admins join the event room for real-time dashboard updates
    if (admin.role === 'SUPER_ADMIN' && admin.eventId) {
      void socket.join(`event:${admin.eventId}`);
      void socket.join(`event:${admin.eventId}:admin`);
    }

    // Gate officers join their gate room
    if (admin.role === 'GATE_OFFICER' && admin.gateId && admin.eventId) {
      void socket.join(`event:${admin.eventId}`);
      void socket.join(`gate:${admin.gateId}`);
    }

    socket.on('disconnect', () => {
      // Socket.io handles room cleanup automatically
    });
  });

  return io;
}

export function getIo(): SocketServer | null {
  return io;
}

// ── Emitted events (documentation) ───────────────────────────────────────────
//
// 'checkin'        → event:<eventId>  — a guest was successfully admitted
//   { passId, passType, gateId, gateCode, facultyCode, graduateName, guestName, checkedInAt }
//
// 'vehicle_request'→ event:<eventId>:admin  — new vehicle pass pending review
//   { passId, graduateName, studentId }
//
// 'vehicle_approved'→ event:<eventId>:admin — vehicle pass approved
//   { passId }
