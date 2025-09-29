// 🔹 Regex validation helper
const summeryValidator = (address) => {
    console.log("address", address)
    let errors = {};

    if (!/^[0-9A-Za-z\-\/]{1,10}$/.test(address.doorNumber || "")) {
        return errors.doorNumber = "Door number invalid";
    }

    if (!/^[A-Za-z0-9\s,.-]{3,100}$/.test(address.addressLine1 || "")) {
        return errors.addressLine1 = "Address Line 1 invalid";
    }

    if (!/^[0-9]{5,6}$/.test(address.zipCode || "")) {
        return errors.zipCode = "Zip Code invalid";
    }

    if (!/^[A-Za-z\s]{2,50}$/.test(address.state || "")) {
        return errors.state = "State invalid";
    }

    if (!/^[A-Za-z\s]{2,50}$/.test(address.country || "")) {
        return errors.country = "County invalid";
    }

    return errors;
};

module.exports = summeryValidator;