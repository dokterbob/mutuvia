// SPDX-License-Identifier: AGPL-3.0-or-later
// Generates a cryptographically secure secret suitable for QR_JWT_SECRET

import { randomBytes } from 'crypto';

const secret = randomBytes(32).toString('base64url');

console.log(secret);
