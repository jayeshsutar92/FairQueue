"""
Load test for FairQueue.

Run locally:
  locust -f locust/locustfile.py --host http://localhost:8000

This simulates a Tatkal spike: users join the queue, poll until admitted,
then contend for seats using Redis locks before confirming payment.
"""
import random
import time

from locust import HttpUser, between, events, task

TRAIN_IDS = [
    "tatkal-rajdhani-12951",
    "tatkal-shatabdi-12001",
    "tatkal-vande-22436",
]


class TatkalUser(HttpUser):
    wait_time = between(0.5, 2.0)

    def on_start(self):
        self.user_id = None
        self.train_id = random.choice(TRAIN_IDS)
        self.admitted = False
        self.booked = False
        with self.client.post(
            "/queue/join",
            json={"train_id": self.train_id},
            name="POST /queue/join",
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                self.user_id = response.json().get("user_id")
            elif response.status_code == 429:
                response.success()

    @task(5)
    def poll_status(self):
        if not self.user_id or self.booked:
            return
        with self.client.get(
            f"/queue/status?user_id={self.user_id}&train_id={self.train_id}",
            name="GET /queue/status",
            catch_response=True,
        ) as response:
            if response.status_code == 200 and response.json().get("status") == "admitted":
                self.admitted = True

    @task(1)
    def try_book(self):
        if not self.admitted or self.booked or not self.user_id:
            return
        coach = random.randint(1, 4)
        seat_n = random.randint(1, 12)
        seat_id = f"{self.train_id}-C{coach}-S{seat_n}"
        with self.client.post(
            "/seats/lock",
            json={"user_id": self.user_id, "train_id": self.train_id, "seat_id": seat_id},
            name="POST /seats/lock",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                return
        time.sleep(0.5)
        with self.client.post(
            "/payment/process",
            json={
                "user_id": self.user_id,
                "train_id": self.train_id,
                "seat_id": seat_id,
                "passenger_name": "Load Tester",
                "passenger_age": 30,
            },
            name="POST /payment/process",
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                self.booked = True


@events.test_start.add_listener
def on_start(environment, **kw):
    print("FairQueue load test starting")
