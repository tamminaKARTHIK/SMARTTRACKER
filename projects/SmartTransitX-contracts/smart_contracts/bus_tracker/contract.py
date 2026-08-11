from algopy import ARC4Contract, BoxMap, UInt64, Bytes, Txn, Global, Account, gtxn
from algopy.arc4 import abimethod

class BusTracker(ARC4Contract):
    def __init__(self) -> None:
        self.expiry_times = BoxMap(Bytes, UInt64, key_prefix=b"exp")
        self.start_times = BoxMap(Bytes, UInt64, key_prefix=b"start")
        self.route_ids = BoxMap(Bytes, Bytes, key_prefix=b"route")
        self.activities = BoxMap(Bytes, Bytes, key_prefix=b"act")

    @abimethod()
    def create_tracking_access(
        self,
        pay_txn: gtxn.PaymentTransaction,
        bus_id: Bytes,
        route_id: Bytes,
        duration_seconds: UInt64
    ) -> None:
        # 1. Verify the payment transaction is correct
        assert pay_txn.receiver == Global.current_application_address, "Payment receiver must be app address"
        
        # 2. Map pricing logic based on duration:
        # 15 mins (900 seconds) -> 0.10 ALGO (100,000 microAlgos)
        # 30 mins (1800 seconds) -> 0.15 ALGO (150,000 microAlgos)
        # 60 mins (3600 seconds) -> 0.25 ALGO (250,000 microAlgos)
        expected_price = UInt64(0)
        if duration_seconds <= 900:
            expected_price = UInt64(100_000)
        elif duration_seconds <= 1800:
            expected_price = UInt64(150_000)
        else:
            expected_price = UInt64(250_000)
            
        assert pay_txn.amount >= expected_price, "Incorrect payment amount for tracking duration"
        
        # 3. Store authorization details
        key = Txn.sender.bytes + bus_id
        self.expiry_times[key] = Global.latest_timestamp + duration_seconds
        self.start_times[key] = Global.latest_timestamp
        self.route_ids[key] = route_id

    @abimethod()
    def is_tracking_access_valid(self, user: Account, bus_id: Bytes) -> UInt64:
        key = user.bytes + bus_id
        expiry, exists = self.expiry_times.maybe(key)
        if not exists:
            return UInt64(0)
            
        if Global.latest_timestamp < expiry:
            return UInt64(1)
        else:
            return UInt64(0)

    @abimethod()
    def get_tracking_access(self, user: Account, bus_id: Bytes) -> tuple[UInt64, UInt64, Bytes]:
        key = user.bytes + bus_id
        expiry, exists = self.expiry_times.maybe(key)
        if not exists:
            return (UInt64(0), UInt64(0), Bytes(b""))
        return (
            self.start_times[key],
            expiry,
            self.route_ids[key]
        )

    @abimethod()
    def expire_tracking_access(self, user: Account, bus_id: Bytes) -> None:
        key = user.bytes + bus_id
        expiry, exists = self.expiry_times.maybe(key)
        if exists:
            del self.expiry_times[key]
            
        start, exists_start = self.start_times.maybe(key)
        if exists_start:
            del self.start_times[key]
            
        route, exists_route = self.route_ids.maybe(key)
        if exists_route:
            del self.route_ids[key]

    @abimethod()
    def record_user_activity(self, activity_type: Bytes, bus_id: Bytes) -> None:
        key = Txn.sender.bytes + activity_type
        self.activities[key] = bus_id
