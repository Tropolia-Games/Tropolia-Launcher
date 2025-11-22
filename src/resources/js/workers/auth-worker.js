"use strict";

const AUTH_API_URL = "https://api.tropolia.fr/auth/authenticate";

class Authenticator {
  async auth(username, password, tfaCode = "") {
    if (!username || !password) {
      throw new Error("Username and password are required.");
    }

    const params = new URLSearchParams();

    params.append("username", username);
    params.append("password", password);

    if (tfaCode) {
      params.append("tfa", tfaCode);
    }

    const response = await fetch(AUTH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const jsonResponse = await response.json();

    if (response.status === 200) {
      return {
        name: jsonResponse.name,
        token: jsonResponse.session,
        uuid: jsonResponse.uuid,
      };
    }

    if (response.status === 400) {
      return { error: true, type: "tfa" };
    }

    throw new Error(jsonResponse.message);
  }
}

module.exports = { Authenticator };
