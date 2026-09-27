'use strict';
/**
 * Acesso a dados da residência e da identidade.
 *
 * Camada sem regra de negócio: apenas consultas parametrizadas.
 */

const db = require('../../config/database');

/** A residência do sistema. A instalação atende uma, mas o modelo suporta várias. */
async function buscarResidencia() {
  return db.row('SELECT id, name, pin_hash FROM households ORDER BY created_at LIMIT 1');
}

async function atualizarCodigoDeAcesso(householdId, pinHash) {
  await db.query('UPDATE households SET pin_hash = $1 WHERE id = $2', [pinHash, householdId]);
}

/** Membro com os dados da residência, usado para montar a sessão. */
async function buscarMembroPorId(id) {
  return db.row(
    `SELECT u.id, u.household_id, u.name, u.email,
            u.avatar_color, u.avatar_initial, u.avatar_icon,
            h.name AS household_name, h.pin_hash
       FROM users u
       JOIN households h ON h.id = u.household_id
      WHERE u.id = $1`,
    [id],
  );
}

module.exports = { buscarResidencia, atualizarCodigoDeAcesso, buscarMembroPorId };
