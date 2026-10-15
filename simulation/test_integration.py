import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class Tags(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.modules = []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if "id" in values:
            self.ids.add(values["id"])
        if tag == "script" and values.get("type") == "module":
            self.modules.append(True)

class VpcMlagRouteContract(unittest.TestCase):
    def test_html_has_interactive_controls(self):
        page = (ROOT / "simulation/vpc-mlag-lab.html").read_text()
        tags = Tags()
        tags.feed(page)
        self.assertTrue(tags.modules)
        self.assertTrue({"vendor", "fail", "restore", "reset", "findings", "health", "report"}.issubset(tags.ids))
        self.assertIn("changeFailures", page)
        self.assertIn("analyzeMlagFailure", page)
        self.assertIn("peerLink1", page)
        self.assertIn("peerLink2", page)
        self.assertIn("peerMemberIds", page)
        self.assertIn("peerLinkMemberCount", page)
        self.assertIn("designPorts", page)
        self.assertIn("loadWorkspaceTopology", page)
        self.assertIn("workspaceTopologyVisual", page)
        self.assertNotIn('<rect id="nodeARect"', page)

    def test_routes_and_workspace_integration(self):
        api = (ROOT / "network_lab.py").read_text()
        app = (ROOT / "app.py").read_text()
        link = (ROOT / "simulation/simulation-vpc-link.js").read_text()
        self.assertIn("@app.get('/vpc-mlag-simulation'", api)
        self.assertIn("@app.get('/simulation/vendor-failure-engine.mjs')", api)
        self.assertIn("@app.get('/simulation-vpc-link.js')", api)
        self.assertIn('src="/simulation-vpc-link.js"', app)
        self.assertIn("scope?.module!=='VPC'", link)
        self.assertIn("iStack", link)
        self.assertIn("api.diagnosticDesign()", link)
        self.assertIn("api.simulationTopologySvg()", link)
        self.assertIn("networkConfigurator.mlagSimulation.topologySvg", link)
        self.assertIn("networkConfigurator.mlagSimulation.design", link)

    def test_simulation_http_routes(self):
        # Test runner sets AUTH_ENABLED=0; production auth remains enabled.
        from fastapi.testclient import TestClient
        from app import app
        client = TestClient(app)
        for route, expected in (
            ("/vpc-mlag-simulation", "Technology Workspace topology"),
            ("/simulation/vendor-failure-engine.mjs", "analyzeAccessImpact"),
            ("/simulation-vpc-link.js", "networkConfigurator.mlagSimulation.topologySvg"),
            ("/synthetic-bgp.js", "SyntheticBGP"),
        ):
            response = client.get(route)
            self.assertEqual(response.status_code, 200, (route, response.text[:150]))
            self.assertIn(expected, response.text)

    def test_legacy_bgp_entry_kept(self):
        main = (ROOT / "web.html").read_text()
        self.assertIn("function ensureSimulationTrigger()", main)
        self.assertIn("bgpTestSimulation", main)
        self.assertIn("networkConfigurator.lab.bgp", main)
        self.assertIn("simulationTopologySvg:()=>workspaceTopologySvg(true)", main)

if __name__ == "__main__":
    unittest.main()
