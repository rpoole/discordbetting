module.exports = {
    requireParams: function() {
        if (!this.request || !this.request.body) {
            this.throw(400, 'No request or no body');
        }

        let params = {};

        for (let param of arguments) {
            if (this.request.body[param] === undefined) {
                this.throw(400, `Missing ${param}`);
            }

            params[param] = this.request.body[param];
        }

        return params;
    },
};
