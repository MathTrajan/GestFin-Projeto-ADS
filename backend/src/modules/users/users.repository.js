'use strict';

const db = require('../../config/database');

const CAMPOS = `u.id, u.household_id, u.name, u.email,
                u.avatar_color, u.avatar_initial, u.avatar_icon,
                h.name AS household_name`;

async function listar() {
  return db.rows(
    `SELECT ${CAMPOS} FROM users u JOIN households h ON h.id = u.household_id ORDER BY u.name`,
  );
}

async function buscarPorId(id) {
  return db.row(
    `SELECT ${CAMPOS} FROM users u JOIN households h ON h.id = u.household_id WHERE u.id = $1`,
    [id],
  );
}

/** Confere se o membro pertence à residência informada (anti-IDOR, RNF12). */
async function pertenceAResidencia(id, householdId) {
  const encontrado = await db.row('SELECT id FROM users WHERE id = $1 AND household_id = $2', [
    id,
    householdId,
  ]);
  return Boolean(encontrado);
}

async function atualizarAvatar(id, { icone, cor }) {
  return db.row(
    `UPDATE users
        SET avatar_icon = $2,
            avatar_color = COALESCE($3, avatar_color)
      WHERE id = $1
      RETURNING id`,
    [id, icone, cor ?? null],
  );
}

module.exports = { listar, buscarPorId, pertenceAResidencia, atualizarAvatar };
