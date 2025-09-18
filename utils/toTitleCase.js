function toTitleCase(str) {
    if (!str || typeof str !== 'string') return '';

    return str
        .toLowerCase()
        .trim()
        .split(' ')
        .map(word => {
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

module.exports = toTitleCase;
