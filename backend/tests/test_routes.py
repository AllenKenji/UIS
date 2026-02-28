import unittest
from backend.app.main import app

class TestRoutes(unittest.TestCase):
    def test_health(self):
        # Example: use TestClient from FastAPI
        from fastapi.testclient import TestClient
        client = TestClient(app)
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)

if __name__ == "__main__":
    unittest.main()
