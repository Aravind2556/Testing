    function capitalizeFirstLetter(input) {
        if (typeof input !== 'string' || input.length === 0) {
            return '';
        }

        const lowerCased = input.toLowerCase().trim();
        const convertedText = lowerCased.charAt(0).toUpperCase() + lowerCased.slice(1);
        return convertedText || ""
    }

    module.exports = capitalizeFirstLetter