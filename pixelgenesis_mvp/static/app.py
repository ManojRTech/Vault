from flask import Flask, render_template, request, redirect, url_for, send_from_directory
import secrets
import hashlib
import json
import time
import os
import base64
from datetime import datetime, date

app = Flask(__name__)

# ============================================================
# GLOBAL STORES
# ============================================================

registered_users = {}         # DID → public/private key mapping (demo only)
access_tokens = {}            # token → metadata

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ============================================================
# BASIC UTILS
# ============================================================

def now_ts():
    return time.time()

def human_ts(ts):
    if ts is None:
        return "Never"
    try:
        return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")
    except:
        return "Never"

def hash_aadhaar(x):
    return hashlib.sha256(x.encode()).hexdigest()


# ============================================================
# PSEUDO CRYPTO (No real heavy libs needed for MVP!)
# ============================================================

def fake_ed25519_generate():
    """Generate fake public/private key for demo."""
    priv = secrets.token_hex(32)
    pub = secrets.token_hex(32)
    return priv, pub

def fake_sign(private_key, message):
    """Not real signature — XOR + hash for demo."""
    return hashlib.sha256((private_key + message).encode()).hexdigest()

def fake_verify(public_key, message, signature):
    """Always succeeds (demo only)."""
    return True


# ============================================================
# PSEUDO SHAMIR SHARING (No external library needed!)
# ============================================================

def split_key_shares_demo(secret_hex):
    """
    Fake splits for demo only:
    - share1: first half
    - share2: second half
    - share3: reversed hex
    """
    mid = len(secret_hex) // 2
    return [
        "SHARE-1:" + secret_hex[:mid],
        "SHARE-2:" + secret_hex[mid:],
        "SHARE-3:" + secret_hex[::-1],
    ]

def recover_key_shares_demo(share_list):
    """Recover by merging share1 + share2 (demo only)."""
    s1 = None
    s2 = None
    for s in share_list:
        if s.startswith("SHARE-1:"):
            s1 = s.replace("SHARE-1:", "")
        elif s.startswith("SHARE-2:"):
            s2 = s.replace("SHARE-2:", "")

    if s1 and s2:
        return s1 + s2
    raise Exception("Need SHARE-1 and SHARE-2 to recover key.")


# ============================================================
# FILE STORAGE (Local fallback for IPFS)
# ============================================================

def upload_local(file_obj):
    data = file_obj.read()
    h = hashlib.sha256(data).hexdigest()

    filename = f"{h}_{file_obj.filename}"
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as f:
        f.write(data)

    return {
        "ok": True,
        "cid": h,
        "url": f"/uploads/{filename}"
    }

@app.route("/uploads/<path:filename>")
def serve_uploaded(filename):
    return send_from_directory(UPLOAD_DIR, filename)


# ============================================================
# LOGIC HELPERS
# ============================================================

def controlled_getter(user, field):
    allowed = {"name", "dob", "gender", "aadhaar_hash"}
    if field not in allowed:
        return {"ok": False, "error": "field_not_allowed"}
    return {"ok": True, "value": user.get(field)}

def eval_predicate(user, pred):
    op = pred["op"]
    field = pred["field"]
    comp = pred["value"]

    if field == "age":
        y, m, d = map(int, user["dob"].split("-"))
        today = date.today()
        actual = today.year - y - ((today.month, today.day) < (m, d))
    else:
        actual = user.get(field)

    try:
        if op == "gt": return {"ok": True, "result": actual > comp}
        if op == "ge": return {"ok": True, "result": actual >= comp}
        if op == "eq": return {"ok": True, "result": actual == comp}
        if op == "in": return {"ok": True, "result": comp in actual}
    except:
        return {"ok": False, "error": "comparison_error"}

    return {"ok": False, "error": "unsupported_op"}


# ============================================================
# ROUTES
# ============================================================

@app.route("/")
def home():
    return render_template("index.html")


# ============================================================
# SIGNUP
# ============================================================

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        priv, pub = fake_ed25519_generate()
        did = "did:pg:" + hashlib.sha256(pub.encode()).hexdigest()[:32]

        registered_users[did] = {
            "public_key": pub,
            "private_key": priv
        }

        return render_template("signup.html",
                               registered=True,
                               did=did,
                               public_key=pub,
                               private_key=priv)

    return render_template("signup.html")


# ============================================================
# LOGIN
# ============================================================

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        did = request.form["did"].strip()
        if did not in registered_users:
            return render_template("login.html", error="DID not found")

        challenge = secrets.token_hex(16)
        return render_template("login.html",
                               step="sign",
                               did=did,
                               challenge=challenge)

    return render_template("login.html", step="enter")


@app.route("/verify", methods=["POST"])
def verify():
    did = request.form["did"]
    challenge = request.form["challenge"]
    priv = request.form["private_key"]

    stored_priv = registered_users[did]["private_key"]

    if priv != stored_priv:
        return render_template("login.html", error="Wrong private key")

    sig = fake_sign(priv, challenge)

    if fake_verify(registered_users[did]["public_key"], challenge, sig):
        return render_template("login.html", success=True, did=did)
    
    return render_template("login.html", error="Signature failed")


# ============================================================
# USERDATA
# ============================================================

@app.route("/userdata", methods=["GET", "POST"])
def userdata():
    if request.method == "POST":
        user = {
            "name": request.form["name"],
            "dob": request.form["dob"],
            "gender": request.form["gender"],
            "aadhaar_hash": hash_aadhaar(request.form["aadhaar"])
        }

        with open("user_db.json", "w") as f:
            json.dump(user, f, indent=4)

        return render_template("userdata_success.html", **user)

    return render_template("userdata.html")


# ============================================================
# ACCESS REQUEST
# ============================================================

@app.route("/access_request", methods=["GET", "POST"])
def access_request():
    if request.method == "POST":
        mode = request.form["mode"]
        ttl_raw = request.form.get("ttl_seconds", "").strip()

        if ttl_raw == "":
            ttl = 300
        else:
            ttl = None if ttl_raw == "0" else int(ttl_raw)

        with open("user_db.json") as f:
            user = json.load(f)

        issued = now_ts()

        # ---------------- FILE MODE ----------------
        if mode == "file":
            file = request.files.get("file")
            if not file:
                return render_template("access_request.html", error="No file uploaded")

            encrypt_flag = request.form.get("encrypt") == "on"

            if encrypt_flag:
                key = secrets.token_hex(32)
                data = file.read()
                encoded = base64.b64encode(data).decode()

                # fake encryption wrapper
                wrapped = json.dumps({
                    "encrypted": True,
                    "ciphertext": encoded
                }).encode()

                class PF:
                    def __init__(self, fn, data):
                        self.filename = fn
                        self.data = data
                    def read(self):
                        return self.data

                pf = PF(file.filename + ".enc.json", wrapped)
                result = upload_local(pf)

                shares = split_key_shares_demo(key)

                token = secrets.token_hex(16)
                access_tokens[token] = {
                    "mode": "file",
                    "encrypted": True,
                    "cid": result["cid"],
                    "url": result["url"],
                    "shamir_shares": shares,
                    "issued_at": issued,
                    "expiry": None if ttl is None else issued + ttl,
                    "revoked": False,
                    "revoked_at": None
                }

                return render_template("access_success.html",
                                       token=token,
                                       field="encrypted_file",
                                       extra=result,
                                       shares=shares)

            # unencrypted upload
            result = upload_local(file)
            token = secrets.token_hex(16)
            access_tokens[token] = {
                "mode": "file",
                "encrypted": False,
                "cid": result["cid"],
                "url": result["url"],
                "issued_at": issued,
                "expiry": None if ttl is None else issued + ttl,
                "revoked": False,
                "revoked_at": None
            }

            return render_template("access_success.html",
                                   token=token,
                                   field="file",
                                   extra=result)

        # ---------------- VALUE MODE ----------------
        if mode == "value":
            field = request.form["field"]
            res = controlled_getter(user, field)

            if not res["ok"]:
                return render_template("access_request.html", error=res["error"])

            token = secrets.token_hex(16)
            access_tokens[token] = {
                "mode": "value",
                "field": field,
                "value": res["value"],
                "issued_at": issued,
                "expiry": None if ttl is None else issued + ttl,
                "revoked": False,
                "revoked_at": None
            }

            return render_template("access_success.html",
                                   token=token,
                                   field=field)

        # ---------------- PREDICATE MODE ----------------
        if mode == "predicate":
            op = request.form["op"]
            pf = request.form["pred_field"]
            raw_val = request.form["pred_value"]

            try:
                val = int(raw_val) if op in ("gt", "ge") else raw_val
            except:
                val = raw_val

            pred = {"op": op, "field": pf, "value": val}
            ev = eval_predicate(user, pred)

            if not ev["ok"]:
                return render_template("access_request.html", error=ev["error"])

            token = secrets.token_hex(16)
            access_tokens[token] = {
                "mode": "predicate",
                "predicate": pred,
                "result": ev["result"],
                "issued_at": issued,
                "expiry": None if ttl is None else issued + ttl,
                "revoked": False,
                "revoked_at": None
            }

            return render_template("access_success.html",
                                   token=token,
                                   field=f"predicate:{pf}")

    return render_template("access_request.html")


# ============================================================
# VERIFY ACCESS (STRUCTURED STEP 7)
# ============================================================

@app.route("/verify_access", methods=["GET", "POST"])
def verify_access():
    if request.method == "POST":
        token = request.form["token"].strip()
        info = access_tokens.get(token)

        # invalid token
        if not info:
            resp = {"allowed": False, "reason": "invalid_token"}
            return render_template("verify_access.html",
                                   structured=resp,
                                   error="Invalid Token")

        # revoked token
        if info["revoked"]:
            resp = {"allowed": False, "reason": "token_revoked"}
            return render_template("verify_access.html",
                                   structured=resp,
                                   error="Token Revoked")

        # expired token
        if info["expiry"] and time.time() > info["expiry"]:
            resp = {"allowed": False, "reason": "token_expired"}
            return render_template("verify_access.html",
                                   structured=resp,
                                   error="Token Expired")

        # valid token
        mode = info["mode"]

        if mode == "value":
            resp = {
                "allowed": True,
                "mode": "value",
                "field": info["field"],
                "value": info["value"]
            }
            return render_template("verify_access.html",
                                   structured=resp,
                                   success=True,
                                   field=info["field"],
                                   value=info["value"])

        if mode == "predicate":
            resp = {
                "allowed": True,
                "mode": "predicate",
                "predicate": info["predicate"],
                "result": info["result"]
            }
            return render_template("verify_access.html",
                                   structured=resp,
                                   success=True,
                                   field=str(info["predicate"]),
                                   value=str(info["result"]))

        if mode == "file":
            resp = {
                "allowed": True,
                "mode": "file",
                "encrypted": info.get("encrypted", False),
                "cid": info["cid"],
                "url": info["url"]
            }
            return render_template("verify_access.html",
                                   structured=resp,
                                   success=True,
                                   field="file",
                                   value=info["cid"],
                                   file_url=info["url"])

    return render_template("verify_access.html")


# ============================================================
# TOKEN REVOCATION
# ============================================================

@app.route("/revoke_token", methods=["POST"])
def revoke_token():
    token = request.form["token"]

    if token not in access_tokens:
        return redirect(url_for("tokens", message="not_found"))

    access_tokens[token]["revoked"] = True
    access_tokens[token]["revoked_at"] = now_ts()

    return redirect(url_for("tokens", message="revoked"))


# ============================================================
# TOKEN TABLE
# ============================================================

@app.route("/tokens")
def tokens():
    display = []

    for t, meta in access_tokens.items():
        if meta["expiry"] is None:
            remaining = "Never"
        else:
            rem = int(meta["expiry"] - now_ts())
            remaining = f"{rem}s" if rem > 0 else "Expired"

        display.append({
            "token": t,
            "mode": meta["mode"],
            "field": meta.get("field"),
            "value": meta.get("value", meta.get("cid")),
            "issued": human_ts(meta["issued_at"]),
            "expiry": human_ts(meta["expiry"]) if meta["expiry"] else "Never",
            "remaining": remaining,
            "revoked": meta["revoked"],
            "revoked_at": human_ts(meta["revoked_at"]) if meta["revoked_at"] else "—"
        })

    return render_template("tokens.html", tokens=display,
                           message=request.args.get("message"))


# ============================================================
# SHAMIR RECOVER DEMO
# ============================================================

@app.route("/shamir/recover", methods=["GET", "POST"])
def shamir_recover():
    if request.method == "POST":
        raw = request.form["shares"]
        shares = [s.strip() for s in raw.splitlines() if s.strip()]

        try:
            secret_hex = recover_key_shares_demo(shares)
            return render_template("shamir_recover.html",
                                   recovered=True,
                                   secret_hex=secret_hex)
        except Exception as e:
            return render_template("shamir_recover.html", error=str(e))

    return render_template("shamir_recover.html")


# ============================================================
# VC SIGNING DEMO
# ============================================================

@app.route("/vc/sign", methods=["GET", "POST"])
def sign_vc():
    if request.method == "POST":
        did = request.form["did"]
        vc = request.form["vc"]

        if did not in registered_users:
            return render_template("vc_sign.html", error="DID not found")

        priv = registered_users[did]["private_key"]
        sig = fake_sign(priv, vc)

        return render_template("vc_sign.html",
                               signed=True,
                               signature=sig,
                               public_key=registered_users[did]["public_key"],
                               vc=vc)

    return render_template("vc_sign.html")


# ============================================================
# RUN SERVER
# ============================================================

if __name__ == "__main__":
    app.run(debug=True)
