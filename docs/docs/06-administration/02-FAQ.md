# Frequently Asked Questions (FAQ)

## User Management

### Lost password

#### If you are not an administrator

Administrators can reset the password of any user. Contact an administrator to reset the password for you.

- Navigate to the `Admin Settings` page
- Find the user in the `Users List`
- In the `Actions` column, there is a button to reset the password
- Enter a new password and press `Reset`
- The new password is now set
- If required, you can change your password again (so the admin does not know your password) in the `User Settings`

#### If you are an administrator

If you are an administrator and lost your password, you have to reset the password in the database.

To reset the password:

- Acquire some kind of tools that helps you to connect to the database:
  - `sqlite3` on Linux: run `apt-get install sqlite3` (depending on your package manager)
  - e.g. `dbeaver` on Windows
- Shut down Karakeep
- Connect to the `db.db` database, which is located in the `data` directory you have mounted to your docker container:
  - by e.g. running `sqlite3 db.db` (in your `data` directory)
  - or going through e.g. the `dbeaver` UI to locate the file in the data directory and connecting to it
- Update the password in the database by running:
  - `update user set password='$2a$10$5u40XUq/cD/TmLdCOyZ82ePENE6hpkbodJhsp7.e/BgZssUO5DDTa', salt='' where email='<YOUR_EMAIL_HERE>';`
  - (don't forget to put your email address into the command)
- The new password for your user is now `adminadmin`.
- Start Karakeep again
- Log in with your email address and the password `adminadmin` and change the password to whatever you want in the `User Settings`

### Adding another administrator

By default, the first user to sign up gets promoted to administrator automatically.

In case you want to grant those permissions to another user:

- Navigate to the `Admin Settings` page
- Find the user in the `Users List`
- In the `Actions` column, there is a button to change the Role
- Change the Role to `Admin`
- Press `Change`
- The new administrator has to log out and log in again to get the new role assigned

### Adding new users, when signups are disabled

Administrators can create new accounts any time:

- Navigate to the `Admin Settings` page
- Go to the `Users List`
- Press the `Create User` Button.
- Enter the information for the user
- Press `create`
- The new user can now log in
