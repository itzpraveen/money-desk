# Money Desk

A simple India-first personal money tracker for monthly income, expenses, assets, balance, savings progress, CSV export, and optional Firebase cloud sync.

Live site:

```text
https://itzpraveen.github.io/money-desk/
```

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

## Host on GitHub Pages

1. Create a GitHub repository.
2. Upload or push these files to the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js`
   - `.nojekyll`
3. In GitHub, open repository `Settings`.
4. Open `Pages`.
5. Set source to `Deploy from a branch`.
6. Select branch `main` and folder `/root`.
7. Save.

This project is published at:

```text
https://itzpraveen.github.io/money-desk/
```

## Data note

Without Firebase settings, Money Desk stores transactions in the browser using `localStorage`.

With Firebase settings, users can sign in and sync data across devices with Firebase Authentication and Cloud Firestore.

## Assets

Money Desk includes an Asset mode alongside Income and Expense. Assets are treated as investments and currently support:

- Cash
- Gold

## Firebase setup

1. Open the Firebase console and create a project.
2. Add a Web app to the project.
3. Copy the Firebase config object.
4. Paste the values into `config.js`.
5. Open `Authentication`, enable the Email/Password sign-in provider.
6. Open `Firestore Database`, create a database.
7. Open Firestore `Rules` and paste the contents of `firestore.rules`.
8. Publish the rules.

The app stores each user's private data under:

```text
users/{userId}/transactions/{transactionId}
users/{userId}/settings/profile
```

The included rules restrict each signed-in user to their own `users/{userId}` document tree.
