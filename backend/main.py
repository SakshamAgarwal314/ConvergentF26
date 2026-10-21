from fastapi import FastAPI

app = FastAPI(title='Skin Detection API') #using API for other git repo; i'll update u guys on this soon

@app.get("/")
def root():
    return {"message":"Skin Detection is running..."} #placeholder

@app.get("/health")
def health():
    return {"status":"ok"}

