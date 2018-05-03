let mapFields = (args, fields) => {
    return fields.reduce( (obj, f, idx) => {
        obj[f] = args[idx];
        if (obj[f].toNumber) {
            obj[f] = args[idx].toNumber();
        }
        return obj;
    }, {});
};

module.exports = {
    Bet: (argsArray) => {
        const fields = ['id', 'numberOfBets', 'information', 'active', 'didWinHappen'];
        return mapFields(argsArray, fields);
    },
};
