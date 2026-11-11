// SQL for customer accounts: sign-up, sign-in, password.
// Query text only: each entry returns the SQL string, and authDA.js runs it (sql.NAME()).
module.exports = {
    // 1 = the mobile is taken, 2 = the email is taken.
    FIND_TAKEN_MOBILE_OR_EMAIL: () => {
        return `
            SELECT TOP 1
                CASE WHEN Mobile = @Mobile THEN 1 ELSE 2 END AS Why
            FROM dbo.Customers
            WHERE Mobile = @Mobile
               OR (@Email IS NOT NULL AND Email = @Email)
        `;
    },

    INSERT_CUSTOMER: () => {
        return `
            INSERT INTO dbo.Customers (
                Name,
                Mobile,
                Email,
                PasswordHash
            )
            OUTPUT
                inserted.CustomerId,
                inserted.Name,
                inserted.Mobile,
                inserted.Email,
                inserted.CreatedOn,
                inserted.MustChangePassword
            VALUES (
                @Name,
                @Mobile,
                @Email,
                @Hash
            )
        `;
    },

    GET_CUSTOMER_FOR_LOGIN: () => {
        return `
            SELECT
                CustomerId,
                Name,
                Mobile,
                Email,
                CreatedOn,
                MustChangePassword,
                IsActive,
                PasswordHash
            FROM dbo.Customers
            WHERE Mobile = @Mobile
        `;
    },

    UPDATE_LAST_LOGIN: () => {
        return `
            UPDATE dbo.Customers
            SET LastLoginOn = SYSUTCDATETIME()
            WHERE CustomerId = @Id
        `;
    },

    GET_ACTIVE_CUSTOMER_BY_ID: () => {
        return `
            SELECT
                CustomerId,
                Name,
                Mobile,
                Email,
                CreatedOn,
                MustChangePassword
            FROM dbo.Customers
            WHERE CustomerId = @Id
              AND IsActive = 1
        `;
    },

    GET_PASSWORD_HASH: () => {
        return `
            SELECT
                PasswordHash
            FROM dbo.Customers
            WHERE CustomerId = @Id
        `;
    },

    UPDATE_PASSWORD: () => {
        return `
            UPDATE dbo.Customers
            SET PasswordHash = @Hash,
                MustChangePassword = 0
            WHERE CustomerId = @Id
        `;
    },
};
