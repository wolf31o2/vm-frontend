import { faXmark, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState, KeyboardEvent } from "react";
import { ClaimableToken, GetRewards } from "../../entities/vm.entities";
import {
    getBlock,
    getPaymentTransactionHash,
    getRewards,
    getTokenTransactionHash,
    getTransactionStatus,
} from "../../services/http.services";
import {
    copyContent,
    formatTokens,
    getNameFromHex,
    truncAmount,
} from "../../services/utils.services";
import {
    ModalTypes,
    PaymentStatus,
    PaymentTransactionHashRequest,
    TokenTransactionHashRequest,
} from "../../entities/common.entities";
import WalletApi from "../../services/connectors/wallet.connector";
import QRCode from "react-qr-code";
import "./index.scss";
import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { showModal } from "src/reducers/modalSlice";
import { getStakeKey } from "./utils/common.function";
import Spinner from "src/components/Spinner";
import ClaimableTokenBox from "./components/ClaimableTokenBox";

let Buffer = require("buffer").Buffer;

interface Params {
    connectedWallet: WalletApi | undefined;
    wrongNetwork: boolean | undefined;
}

function Rewards({ connectedWallet, wrongNetwork }: Params) {
    const dispatch = useDispatch();

    const [hideCheck, setHideCheck] = useState(false);
    const [hideStakingInfo, setHideStakingInfo] = useState(true);
    const [hideSendAdaInfo, setHideSendAdaInfo] = useState(true);
    const [rewards, setRewards] = useState<GetRewards>();
    const [searchAddress, setSearchAddress] = useState<string>("");
    const [rewardsLoader, setRewardsLoader] = useState(false);
    const [statusLoader, setStatusLoader] = useState(false);
    const [checkedState, setCheckedState] = useState(new Array<boolean>());
    const [checkedCount, setCheckedCount] = useState(0);
    const [adaToSend, setAdaToSend] = useState(0);
    const [aproxReturn, setAproxReturn] = useState(0);
    const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>();
    const [showTooltip, setShowTooltip] = useState(false);
    const [sendAdaSpinner, setSendAdaSpinner] = useState(false);
    const [paymentTxAfterBlock, setPaymentTxAfterBlock] = useState<number>();
    const [tokenTxAfterBlock, setTokenTxAfterBlock] = useState<number>();
    const [allIsSelected, setAllIsSelected] = useState<boolean>(false);

    const checkInterval = 10000;

    useEffect(() => {
        setAllIsSelected(checkedState.every((i) => i));
    }, [checkedState]);

    const selectAll = () => {
        let updatedCheckedState;
        if (allIsSelected) {
            updatedCheckedState = checkedState.map(() => false);
        } else {
            updatedCheckedState = checkedState.map(() => true);
        }

        setCheckedState(updatedCheckedState);
        const updatedCheckedCount = updatedCheckedState.filter(
            (check) => check
        ).length;
        setCheckedCount(updatedCheckedCount);
    };

    const handleOnChange = (position: number) => {
        const updatedCheckedState = checkedState.map((item, index) =>
            index === position ? !item : item
        );

        setCheckedState(updatedCheckedState);
        const updatedCheckedCount = updatedCheckedState.filter(
            (check) => check
        ).length;
        setCheckedCount(updatedCheckedCount);
    };

    const checkRewards = async () => {
        if (searchAddress) {
            setRewardsLoader(true);
            try {
                /**
                 * check if the inserted address is cardano address
                 * we want the stake address
                 * if it is cardano address, get the staking address
                 */
                let address = getStakeKey(searchAddress);
                if (address == null) throw new Error();

                const rewards = await getRewards(address);

                if (
                    rewards &&
                    Object.keys(rewards.consolidated_promises).length
                ) {
                    setRewards(rewards);
                    setRewardsLoader(false);
                } else {
                    dispatch(
                        showModal({
                            text: "No rewards found for the account, yet.",
                            type: ModalTypes.info,
                        })
                    );
                    setRewardsLoader(false);
                }
            } catch (ex: any) {
                switch (true) {
                    case ex?.response?.status === 404:
                    default:
                        dispatch(
                            showModal({
                                text: "Account not found.",
                                type: ModalTypes.info,
                            })
                        );
                        setRewardsLoader(false);
                }
            }
        }
    };

    const claimRewardsChecked = async () => {
        if (checkedCount > 0) {
            let tokens: ClaimableToken[] = [];
            checkedState.forEach((check, i) => {
                if (check && rewards?.claimable_tokens[i]) {
                    tokens.push(rewards.claimable_tokens[i]);
                }
            });
            claimRewards(tokens);
        }
    };

    const backRewards = async () => {
        setRewards(undefined);
        setSearchAddress("");
    };

    const sendADA = async () => {
        // TODO: Check that searched stake address === connected wallet stake address
        if (rewards) {
            setSendAdaSpinner(true);
            const txHash = await connectedWallet?.transferAda(
                rewards.vending_address,
                adaToSend.toString()
            );
            if (txHash) {
                if (isTxHash(txHash)) {
                    dispatch(
                        showModal({
                            text: "Transaction ID: " + txHash,
                            type: ModalTypes.info,
                        })
                    );
                    setPaymentStatus(PaymentStatus.AwaitingConfirmations);
                    setPaymentTxAfterBlock(undefined);
                    checkPaymentTransaction(txHash);
                } else {
                    dispatch(
                        showModal({ text: txHash, type: ModalTypes.info })
                    );
                }
            }
            setSendAdaSpinner(false);
        }
    };

    const isTxHash = (txHash: string) => {
        return txHash.length === 64 && txHash.indexOf(" ") === -1;
    };

    const claimRewards = (tokens: ClaimableToken[]) => {
        if (rewards) {
            const tokenValue = 300000;
            const updatedAdaToSend =
                rewards.min_balance + tokenValue + tokens.length * tokenValue;
            const falseArray = new Array(checkedState.length).fill(false);
            const updatedAproxReturn =
                updatedAdaToSend - 168000 - 200000 * tokens.length;
            tokens.forEach((t: any, i) => (falseArray[i] = true));
            setCheckedState(falseArray);
            setCheckedCount(tokens.length);
            setAdaToSend(updatedAdaToSend);
            setAproxReturn(updatedAproxReturn);
            setHideCheck(true);
            setHideStakingInfo(true);
            setHideSendAdaInfo(false);
        }
    };

    const renderStakeInfo = () => {
        if (rewards?.pool_info) {
            return (
                <>
                    {rewards?.pool_info?.delegated_pool_logo ? (
                        <img
                            className="pool-logo"
                            src={rewards?.pool_info?.delegated_pool_logo}
                            alt=""
                        />
                    ) : (
                        ""
                    )}
                    <div className="pool-info">
                        <div className="staking-info">
                            Currently staking&nbsp;
                            <b>{rewards?.pool_info?.total_balance} ADA</b>
                            &nbsp;with&nbsp;
                            <b className="no-break">
                                [{rewards?.pool_info?.delegated_pool_name}
                                ]&nbsp;
                                {rewards?.pool_info?.delegated_pool_description}
                            </b>
                            <b className="no-break-mobile">
                                [{rewards?.pool_info?.delegated_pool_name}]
                            </b>
                        </div>
                    </div>
                </>
            );
        } else {
            return <>Unregisted</>;
        }
    };

    const renderPaymentStatus = () => {
        switch (paymentStatus) {
            case PaymentStatus.Awaiting:
                return <span className="awaiting">Awaiting payment</span>;
            case PaymentStatus.AwaitingConfirmations:
                return (
                    <span className="confirmations">
                        Awaiting payment confirmations
                    </span>
                );
            case PaymentStatus.Sent:
                return (
                    <span className="confirmed">
                        Payment confirmed, sending tokens
                    </span>
                );
            case PaymentStatus.Completed:
                return <span className="completed">Withdraw completed</span>;
        }
    };

    const triggerTooltip = () => {
        setShowTooltip(true);
        setTimeout(() => {
            setShowTooltip(false);
        }, 1000);
    };

    const checkPaymentTransaction = useCallback((txHash: string) => {
        const checkPaymentTransactionInterval = setInterval(async () => {
            const transaction = await getTransactionStatus(txHash);
            if (
                transaction &&
                transaction.length &&
                transaction[0].num_confirmations
            ) {
                const blockNumber = await getBlock();
                setTokenTxAfterBlock(blockNumber.block_no);
                setPaymentStatus(PaymentStatus.Sent);
                clearInterval(checkPaymentTransactionInterval);
            }
        }, checkInterval);
    }, []);

    const checkTokenTransaction = useCallback((txHash: string) => {
        const checkTokenTransactionInterval = setInterval(async () => {
            const transaction = await getTransactionStatus(txHash);
            if (
                transaction &&
                transaction.length &&
                transaction[0].num_confirmations
            ) {
                setPaymentStatus(PaymentStatus.Completed);
                clearInterval(checkTokenTransactionInterval);
            }
        }, checkInterval);
    }, []);

    const findPaymentTxHash = useCallback(() => {
        const checkPaymentInterval = setInterval(async () => {
            if (searchAddress) {
                const request: PaymentTransactionHashRequest = {
                    address: searchAddress,
                    toAddress: rewards?.vending_address || "",
                    afterBlock: paymentTxAfterBlock || 0,
                    adaToSend,
                };
                const response = await getPaymentTransactionHash(request);
                if (response && response.txHash) {
                    setPaymentStatus(PaymentStatus.AwaitingConfirmations);
                    checkPaymentTransaction(response.txHash);
                    clearInterval(checkPaymentInterval);
                }
            }
        }, checkInterval);
    }, [
        adaToSend,
        paymentTxAfterBlock,
        rewards?.vending_address,
        searchAddress,
        checkPaymentTransaction,
    ]);

    const findTokenTxHash = useCallback(() => {
        const checkTokenInterval = setInterval(async () => {
            if (searchAddress) {
                let tokens: ClaimableToken[] = [];
                checkedState.forEach((check, i) => {
                    if (check && rewards?.claimable_tokens[i]) {
                        tokens.push(rewards.claimable_tokens[i]);
                    }
                });
                const request: TokenTransactionHashRequest = {
                    address: searchAddress,
                    afterBlock: tokenTxAfterBlock || 0,
                    tokens: tokens.map((token) => ({
                        policyId: token.assetId.split(".")[0],
                        quantity: token.amount.toString(),
                    })),
                };
                const response = await getTokenTransactionHash(request);
                if (response && response.txHash) {
                    checkTokenTransaction(response.txHash);
                    clearInterval(checkTokenInterval);
                }
            }
        }, checkInterval);
    }, [
        checkedState,
        rewards?.claimable_tokens,
        searchAddress,
        tokenTxAfterBlock,
        checkTokenTransaction,
    ]);

    useEffect(() => {
        async function init() {
            if (adaToSend !== 0) {
                const blockNumber = await getBlock();
                setPaymentTxAfterBlock(blockNumber.block_no);
                setPaymentStatus(PaymentStatus.Awaiting);
            }
        }

        init();
    }, [adaToSend]);

    useEffect(() => {
        switch (paymentStatus) {
            case PaymentStatus.Awaiting:
                findPaymentTxHash();
                break;
            case PaymentStatus.AwaitingConfirmations:
                setStatusLoader(true);
                break;
            case PaymentStatus.Sent:
                findTokenTxHash();
                break;
            case PaymentStatus.Completed:
                setStatusLoader(false);
                break;
        }
    }, [paymentStatus, findPaymentTxHash, findTokenTxHash]);

    useEffect(() => {
        if (rewards?.claimable_tokens.length) {
            setCheckedState(
                new Array(rewards.claimable_tokens.length).fill(false)
            );
            setHideStakingInfo(false);
        } else {
            setCheckedState([]);
            setHideStakingInfo(true);
        }
    }, [rewards?.claimable_tokens]);

    useEffect(() => {
        async function init() {
            if (connectedWallet?.wallet?.api && !wrongNetwork) {
                setSearchAddress(await connectedWallet.getAddress());
                setHideCheck(false);
                setHideStakingInfo(true);
                setHideSendAdaInfo(true);
            } else {
                setPaymentStatus(undefined);
            }
        }

        init();
    }, [connectedWallet?.wallet?.api, connectedWallet, wrongNetwork]);

    function renderSendAdaButton() {
        if (connectedWallet?.wallet?.api && !wrongNetwork) {
            return (
                <button className="tosi-button" onClick={sendADA}>
                    Send ADA {sendAdaSpinner ? <Spinner></Spinner> : null}
                </button>
            );
        } else {
            return null;
        }
    }

    function renderQRCode() {
        if (rewards?.vending_address) {
            return (
                <div className="qr-address">
                    <QRCode value={rewards?.vending_address} size={180} />
                </div>
            );
        } else {
            return null;
        }
    }

    function renderCheckRewardsStep() {
        if (!hideCheck) {
            return (
                <div className="content-reward check">
                    <p>
                        Enter your wallet/stake address or $handle to view your
                        rewards
                    </p>
                    <input
                        className="transparent-input"
                        type="text"
                        value={searchAddress}
                        onInput={(e: KeyboardEvent<HTMLInputElement>) =>
                            setSearchAddress(
                                (e.target as HTMLInputElement).value
                            )
                        }
                        disabled={
                            !hideStakingInfo ||
                            (typeof connectedWallet?.wallet?.api !==
                                "undefined" &&
                                !wrongNetwork)
                        }
                    ></input>
                    <div className="content-button">
                        <button
                            className="tosi-button"
                            disabled={!hideStakingInfo}
                            onClick={checkRewards}
                        >
                            Check my rewards
                            {rewardsLoader ? <Spinner></Spinner> : null}
                        </button>
                        <button
                            className={
                                "tosi-cancel-button" +
                                (hideStakingInfo ? " hidden" : "")
                            }
                            onClick={backRewards}
                        >
                            <div className="tosi-cancel-icon">
                                <FontAwesomeIcon icon={faXmark} />
                            </div>
                            <div className="tosi-cancel-text">Cancel</div>
                        </button>
                    </div>
                </div>
            );
        } else {
            return null;
        }
    }

    function renderStatusStep() {
        if (!hideSendAdaInfo) {
            return (
                <>
                    <div className="claim-details">
                        <div className="content-reward claim-status-head">
                            Claim status:
                            <span className="payment-status">
                                {renderPaymentStatus()}
                            </span>
                        </div>
                        <div className="content-reward claim-status-body">
                            <div className="complete-info">
                                Please complete the withdrawal process by
                                sending{" "}
                                <b>
                                    {formatTokens(adaToSend.toString(), 6, 1)}{" "}
                                    ADA
                                </b>{" "}
                                using one of the following options:
                                <ul>
                                    <li>
                                        manual transfer to the address below,
                                    </li>
                                    <li>
                                        transfer by scanning the QR code, or
                                    </li>
                                    <li>
                                        <b>Send ADA</b> button (if your wallet
                                        is connected).
                                    </li>
                                </ul>
                            </div>
                            <div className="complete-info-warning">
                                Please only send{" "}
                                {formatTokens(adaToSend.toString(), 6, 1)} ADA.
                                Any other amount will be considered an error and
                                refunded in aproximately 72 hours
                            </div>
                            <div className="icon-input">
                                <div
                                    className={
                                        "tooltip-icon" +
                                        (showTooltip ? "" : " hidden")
                                    }
                                >
                                    Address copied
                                </div>
                                <div
                                    className="icon"
                                    onClick={() => {
                                        copyContent(
                                            rewards
                                                ? rewards.vending_address
                                                : ""
                                        );
                                        triggerTooltip();
                                    }}
                                >
                                    <FontAwesomeIcon icon={faCopy} />
                                </div>
                                <input
                                    className="transparent-input"
                                    type="text"
                                    disabled={true}
                                    value={rewards?.vending_address}
                                />
                            </div>
                            {renderQRCode()}
                            {renderSendAdaButton()}
                        </div>
                    </div>
                    <div className="transaction-details">
                        <div className="content-reward tx-details-head">
                            <div>Transaction Details</div>
                            <div></div>
                        </div>
                        <div className="content-reward tx-details-body">
                            <div>Selected {checkedCount} tokens</div>
                            <div>
                                {formatTokens(
                                    (checkedCount * 300000).toString(),
                                    6,
                                    1
                                )}{" "}
                                ADA
                            </div>
                        </div>
                        <div className="content-reward tx-details-body">
                            <div>Withdraw Fees</div>
                            <div>
                                {formatTokens(rewards?.withdrawal_fee, 6, 1)}{" "}
                                ADA
                            </div>
                        </div>
                        <div className="content-reward tx-details-body">
                            <div>Base Deposit</div>
                            <div>
                                {formatTokens(
                                    (
                                        (rewards?.min_balance || 0) + 300000
                                    ).toString(),
                                    6,
                                    1
                                )}{" "}
                                ADA
                            </div>
                        </div>
                        <div className="content-reward tx-details-body small-body">
                            <div>You Send</div>
                            <div>
                                {formatTokens(adaToSend.toString(), 6, 1)} ADA
                            </div>
                        </div>
                        <div className="content-reward tx-details-body small-body">
                            <div>Tx Fees</div>
                            <div>~0.168 ADA</div>
                        </div>
                        <div className="content-reward tx-details-body small-body-last">
                            <div>Total transaction</div>
                            <div>
                                ~
                                {formatTokens(
                                    (adaToSend + 168053).toString(),
                                    6,
                                    3
                                )}{" "}
                                ADA
                            </div>
                        </div>
                        <div className="content-reward tx-details-body">
                            <div>You'll get back (Aprox)</div>
                            <div>
                                ~{formatTokens(aproxReturn.toString(), 6, 3)}{" "}
                                ADA
                            </div>
                        </div>
                        <div className="content-reward tx-details-footer">
                            <div className="deposit-info">
                                You will pay a deposit, we will discount the
                                withdraw fees and the tx fees (variable
                                depending amount and size of tokens). Usually
                                it'll cost no more than 0.5 ADA
                            </div>
                        </div>
                    </div>
                </>
            );
        } else {
            return null;
        }
    }

    function renderStakingInfoStep() {
        if (!hideStakingInfo) {
            return (
                <div className="staking-info">
                    <div className={"content-reward staked"}>
                        {renderStakeInfo()}
                    </div>
                    <div className={"claim-list"}>
                        {rewards?.claimable_tokens?.map((token, index) => {
                            console.log(token);
                            return (
                                <ClaimableTokenBox
                                    key={index}
                                    index={index}
                                    ticker={token.ticker}
                                    checked={checkedState[index]}
                                    handleOnChange={handleOnChange}
                                    amount={token.amount}
                                    decimals={token.decimals}
                                    logo={token.logo}
                                    assetId={token.assetId}
                                />
                            );
                        })}
                    </div>

                    <div className={"content-reward claim"}>
                        <div className="text">
                            Selected {checkedCount} token
                        </div>
                        <button className="tosi-button" onClick={selectAll}>
                            {allIsSelected ? "Unselect All" : "Select All"}
                        </button>
                        <button
                            className="tosi-button"
                            disabled={checkedCount === 0}
                            onClick={claimRewardsChecked}
                        >
                            <div className="down-arrow"></div>
                            Claim my rewards
                        </button>
                    </div>
                </div>
            );
        } else {
            return null;
        }
    }

    return (
        <div className="rewards">
            <h1>Claim your rewards</h1>
            {renderCheckRewardsStep()}
            {renderStakingInfoStep()}
            {renderStatusStep()}
        </div>
    );
}

export default Rewards;
