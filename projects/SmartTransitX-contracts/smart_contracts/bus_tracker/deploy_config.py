import logging
import algokit_utils

logger = logging.getLogger(__name__)

# define deployment behaviour based on supplied app spec
def deploy() -> None:
    from smart_contracts.artifacts.bus_tracker.bus_tracker_client import (
        BusTrackerFactory,
    )

    algorand = algokit_utils.AlgorandClient.from_environment()
    deployer_ = algorand.account.from_environment("DEPLOYER")

    factory = algorand.client.get_typed_app_factory(
        BusTrackerFactory, default_sender=deployer_.address
    )

    app_client, result = factory.deploy(
        on_update=algokit_utils.OnUpdate.AppendApp,
        on_schema_break=algokit_utils.OnSchemaBreak.AppendApp,
    )

    if result.operation_performed in [
        algokit_utils.OperationPerformed.Create,
        algokit_utils.OperationPerformed.Replace,
    ]:
        # Fund the contract account with 1 ALGO so it can pay box MBR
        algorand.send.payment(
            algokit_utils.PaymentParams(
                amount=algokit_utils.AlgoAmount(algo=1),
                sender=deployer_.address,
                receiver=app_client.app_address,
            )
        )
        logger.info(f"Funded BusTracker app {app_client.app_id} with 1 ALGO")

    logger.info(f"Deployed BusTracker app ({app_client.app_id})")
