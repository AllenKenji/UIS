from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_residents():
    response = client.get("/residents/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
