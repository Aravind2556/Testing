const bcrypt = require('bcrypt')
const saltRounds = parseInt(process.env.saltRounds)

const hashPassword = async (plainPassword) => {
    return await bcrypt.hash(plainPassword, saltRounds);
};

const verifyPassword = async (plainPassword, storedHash) => {
    return await bcrypt.compare(plainPassword, storedHash);
};

module.exports = {hashPassword, verifyPassword}